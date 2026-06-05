// Flostruction — Twilio Inbound SMS Webhook
// POST /api/webhooks/twilio/sms-reply
// Handles supervisor SMS replies: YES ALL, YES [CODE], NO [CODE], HELP
// CRITICAL: Twilio signature validation runs before any state-mutating
// operation. Rate limit moved after signature validation per CRACK 102.
// Non-negotiable: YES ALL only approves clean shifts (no HIGH/MEDIUM flags).

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { validateTwilioSignature } from '@/lib/twilio/client';
import { parseSMSReply } from '@/lib/sms/parse';
import { extractCode } from '@/lib/sms/compose';
import { isWlesV1Enabled } from '@/lib/wles/flags';
import { sealEvent } from '@/lib/wles/v1';
import { buildApproval, buildDisputeRaised } from '@/lib/wles/v1-translate';
import { getV1ChainTail, insertV1Event } from '@/lib/wles/v1-chain';
import { notifyPayrollAdmin, notifyPayrollDispute } from '@/lib/email/notify';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/security/rate-limit';
import { checkAndRecordWebhookIdempotency } from '@/lib/security/idempotency';
import type { AnomalyFlag } from '@/lib/intelligence/rules';
// L2.1 chunk 3 — RULE_011 (RUBBER_STAMP_RISK) fires when YES ALL
// arrives within 5 seconds of the supervisor SMS batch send AND the
// batch contains 3+ shifts. Informational only — never blocks the
// approval; the flag is appended to each approved shift's
// anomaly_flags so it surfaces in the supervisor's review UI.
import { checkRule011 } from '@/lib/intelligence/collusion-rules';
// Patch 3.7 (CRACK 82, 83) — replace truncated/duplicated sendWorkerVerifiedSms
// with the canonical helper (static import, env validation, proper Twilio
// result handling).
import { sendWorkerApprovedSms } from '@/lib/sms/worker-notify';

import { routeLogger } from '@/lib/logger';
// CREDENTIAL REQUIRED: TWILIO_AUTH_TOKEN
// CREDENTIAL REQUIRED: RESEND_API_KEY

// Patch 3.9 (CRACK 81) — startup warning for missing TWILIO_FROM_NUMBER.
// Module-level log only; runtime validation happens inside helper.
if (!process.env.TWILIO_FROM_NUMBER) {
  console.error('[startup] TWILIO_FROM_NUMBER missing from env — worker confirmation SMS will fail');
}

// Patch 3.13 (CRACK 111) — startup warning for missing NEXT_PUBLIC_APP_URL.
// Webhook signature validation depends on this URL matching exactly what's
// configured in Twilio Console. Module-level warn + runtime guard inside POST.
if (!process.env.NEXT_PUBLIC_APP_URL) {
  console.error('[startup] NEXT_PUBLIC_APP_URL must be set — webhook signature validation will fail');
}

// ─── TwiML response helper ─────────────────────────────────────────────────
function twimlResponse(message: string): Response {
  const escaped = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

// ─── Types ──────────────────────────────────────────────────────────────────
interface ShiftWithWorkerSite {
  id: string;
  company_id: string;
  worker_id: string;
  site_id: string;
  shift_date: string;
  total_hours: string | null;
  receipt_id: string;
  status: string;
  anomaly_flags: AnomalyFlag[] | null;
  workers: { first_name: string; last_name: string } | null;
  sites: { name: string } | null;
}

interface SupervisorRow {
  id: string;
  company_id: string;
  name: string;
  phone: string;
  site_ids: string[] | null;
  pending_sms_approval_ids: string[] | null;
  verify_token: string;
  // Patch 5.4 #1 (CRACK 11/67/98 closure) — Migration 2.0 (6 May 2026)
  // renamed last_batch_sms_date (DATE) to last_batch_sms_sent_at
  // (TIMESTAMPTZ). RULE_011 latency calc now has sub-minute precision.
  last_batch_sms_sent_at: string | null;
}

// ─── Main Route Handler ─────────────────────────────────────────────────────
export async function POST(request: Request): Promise<Response> {
  const log = routeLogger('POST /api/webhooks/twilio/sms-reply', request.headers.get('x-request-id'));
  log.info({ method: 'POST' }, 'request.received');

  // Patch 3.13 (CRACK 111) — runtime guard. Module-level warn already fired.
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
  if (!APP_URL) {
    return new Response('Server misconfiguration', { status: 500 });
  }

  // 1. Parse the URL-encoded body from Twilio
  let formParams: Record<string, string>;
  try {
    const formData = await request.formData();
    formParams = {} as Record<string, string>;
    formData.forEach((value, key) => {
      formParams[key] = value.toString();
    });
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  // 2. CRITICAL: Validate Twilio signature BEFORE rate limit (Patch 3.10 / CRACK 102).
  // Unsigned spam shouldn't deplete rate-limit budget reserved for legitimate Twilio traffic.
  const signature = request.headers.get('x-twilio-signature') ?? '';
  const webhookUrl = `${APP_URL}/api/webhooks/twilio/sms-reply`;

  if (!validateTwilioSignature(signature, webhookUrl, formParams)) {
    return new Response('Forbidden', { status: 403 });
  }

  // 3. Rate limit (Patch 3.10 — moved after signature validation per CRACK 102).
  const clientIP = getClientIP(request);
  const rl = checkRateLimit(`webhook:${clientIP}`, RATE_LIMITS.WEBHOOK);
  if (!rl.allowed) {
    return new Response('Rate limit exceeded', { status: 429 });
  }

  // 4. A2 idempotency guard — Twilio retries failed webhook deliveries with
  // the same MessageSid. If we've seen this SID already, don't reprocess.
  // We do this AFTER signature validation so a malicious caller can't
  // pollute our idempotency table with forged keys.
  const messageSid = formParams.MessageSid ?? '';
  if (messageSid) {
    const { duplicate, firstSeenAt } = await checkAndRecordWebhookIdempotency(
      'twilio',
      messageSid,
      '/api/webhooks/twilio/sms-reply',
    );
    if (duplicate) {
      log.info({ messageSid, firstSeenAt }, 'webhook.replay.ignored');
      // Twilio retries on non-200 responses. Return 200 with an empty
      // TwiML so the original processing outcome stands.
      return twimlResponse('');
    }
  } else {
    log.warn({ formParamKeys: Object.keys(formParams) }, 'webhook.twilio.missing_message_sid');
  }

  const fromPhone = formParams.From ?? '';
  const body = (formParams.Body ?? '').trim();

  const supabase = createServiceClient();

  // 3. Look up supervisor by phone
  const { data: supervisor, error: supError } = await supabase
    .from('supervisors')
    .select('id, company_id, name, phone, site_ids, pending_sms_approval_ids, verify_token, last_batch_sms_sent_at')
    .eq('phone', fromPhone)
    .eq('is_active', true)
    .single();

  if (supError || !supervisor) {
    return twimlResponse('This number is not registered with Flostruction.');
  }

  const sup = supervisor as SupervisorRow;
  const pendingCodes = sup.pending_sms_approval_ids ?? [];

  if (pendingCodes.length === 0) {
    return twimlResponse('No pending shifts to approve. Check Flostruction Command.');
  }

  // 4. Parse the SMS reply
  const parsed = parseSMSReply(body, pendingCodes);

  // 5. Get company contact email for notifications
  const { data: company } = await supabase
    .from('companies')
    .select('contact_email')
    .eq('id', sup.company_id)
    .single();

  const payrollEmail = company?.contact_email ?? '';
  // Patch 3.13 — APP_URL was already validated as truthy at top of POST.
  const backupUrl = `${APP_URL}/v/${sup.verify_token}`;

  // 6. Handle each command type
  switch (parsed.action) {
    case 'YES_ALL': {
      return await handleYesAll(supabase, sup, pendingCodes, payrollEmail, backupUrl);
    }

    case 'YES_CODE': {
      // Patch 3.3 (CRACK 71) — drop pendingCodes leakage from error path
      if (!parsed.code) {
        return twimlResponse(`Reply YES followed by a shift code. Reply HELP for instructions. Details: ${backupUrl}`);
      }
      // Patch 3.12 (CRACK 110) — explicit code-membership check.
      // parseSMSReply returns 'YES_CODE' even when the code is not in
      // pendingCodes; belt-and-braces reject before dispatching.
      if (!pendingCodes.includes(parsed.code.toUpperCase())) {
        return twimlResponse(`Shift code ${parsed.code} is not in your pending approvals. Reply HELP for instructions.`);
      }
      return await handleYesCode(supabase, sup, parsed.code, pendingCodes, payrollEmail);
    }

    case 'NO_CODE': {
      // Patch 3.3 (CRACK 71) — drop pendingCodes leakage
      if (!parsed.code) {
        return twimlResponse(`Reply NO followed by a shift code. Reply HELP for instructions. Details: ${backupUrl}`);
      }
      // Patch 3.12 (CRACK 110) — explicit code-membership check
      if (!pendingCodes.includes(parsed.code.toUpperCase())) {
        return twimlResponse(`Shift code ${parsed.code} is not in your pending approvals. Reply HELP for instructions.`);
      }
      return await handleNoCode(supabase, sup, parsed.code, pendingCodes, payrollEmail);
    }

    case 'HELP': {
      return twimlResponse(
        `Flostruction commands: YES ALL (approve clean shifts) | YES [code] (approve one) | NO [code] (flag one). View details: ${backupUrl}`
      );
    }

    case 'UNKNOWN':
    default: {
      // Patch 3.3 (CRACK 71) — drop pendingCodes leakage
      return twimlResponse(
        `Reply YES ALL to approve, or YES/NO [code] for one shift. Reply HELP for instructions. Details: ${backupUrl}`
      );
    }
  }
}

// ─── YES ALL handler ────────────────────────────────────────────────────────
// Non-negotiable: YES ALL only approves shifts with NO HIGH or MEDIUM flags.
// Flagged shifts remain and are listed for individual review.
async function handleYesAll(
  supabase: ReturnType<typeof createServiceClient>,
  supervisor: SupervisorRow,
  pendingCodes: string[],
  payrollEmail: string,
  backupUrl: string
): Promise<Response> {
  // Fetch all pending shifts matching the codes
  const { data: allShifts } = await supabase
    .from('shifts')
    .select('id, company_id, worker_id, site_id, shift_date, total_hours, receipt_id, status, anomaly_flags, workers(first_name, last_name), sites(name)')
    .eq('status', 'SUBMITTED')
    .in('site_id', supervisor.site_ids ?? []);

  if (!allShifts || allShifts.length === 0) {
    return twimlResponse('No pending shifts found.');
  }

  // Filter to only shifts with codes in pendingCodes
  const pendingShifts = (allShifts as unknown as ShiftWithWorkerSite[]).filter(
    (s) => pendingCodes.includes(extractCode(s.receipt_id))
  );

  // Separate clean vs flagged
  const cleanShifts = pendingShifts.filter((s) => {
    const flags = (s.anomaly_flags ?? []) as AnomalyFlag[];
    return !flags.some((f) => f.severity === 'HIGH' || f.severity === 'MEDIUM');
  });

  const flaggedShifts = pendingShifts.filter((s) => {
    const flags = (s.anomaly_flags ?? []) as AnomalyFlag[];
    return flags.some((f) => f.severity === 'HIGH' || f.severity === 'MEDIUM');
  });

  if (cleanShifts.length === 0) {
    // All shifts are flagged — Patch 3.4 (CRACK 74): drop worker first names
    const flaggedList = flaggedShifts
      .map((s) => `Shift ${extractCode(s.receipt_id)}`)
      .join(', ');
    return twimlResponse(
      `All shifts need individual review. Reply YES [code] or NO [code] for each: ${flaggedList}. Details: ${backupUrl}`
    );
  }

  // L2.1 chunk 3 — RULE_011 (RUBBER_STAMP_RISK). Compute reply
  // latency from supervisor.last_batch_sms_sent_at. If the supervisor
  // approves >=3 shifts within <=5 seconds of receiving the batch,
  // append the flag to each approved shift's anomaly_flags. The
  // approval still proceeds — the flag is informational and surfaces
  // in the supervisor's review UI.
  // Patch 5.4 (CRACK 11/67/98) — Migration 2.0 (6 May 2026) renamed
  // last_batch_sms_date (DATE) to last_batch_sms_sent_at (TIMESTAMPTZ),
  // restoring sub-minute precision. RULE_011 now functions as designed.
  let rule011Flag: AnomalyFlag | null = null;
  if (supervisor.last_batch_sms_sent_at && cleanShifts.length >= 3) {
    const replyLatencySeconds = Math.max(
      0,
      Math.round(
        (Date.now() -
          new Date(supervisor.last_batch_sms_sent_at).getTime()) /
          1000,
      ),
    );
    const r011 = checkRule011({
      supervisor_first_name: supervisor.name.split(' ')[0] ?? supervisor.name,
      approval_count_in_batch: cleanShifts.length,
      reply_latency_seconds: replyLatencySeconds,
    });
    if (r011.triggered && r011.flag) {
      rule011Flag = r011.flag;
    }
  }

  // Approve all clean shifts. If RULE_011 fired, append the flag to
  // each approved shift's anomaly_flags BEFORE the seal so the
  // intelligence record carries the rubber-stamp signal.
  const approvedCodes: string[] = [];
  for (const shift of cleanShifts) {
    if (rule011Flag) {
      const existingFlags = (shift.anomaly_flags ?? []) as AnomalyFlag[];
      // Defensive: don't double-append if a previous run already
      // flagged this shift with RULE_011.
      const alreadyFlagged = existingFlags.some(
        (f) => f.ruleId === 'RULE_011',
      );
      if (!alreadyFlagged) {
        const merged = [...existingFlags, rule011Flag];
        // Patch 3.5 partial — capture error; full atomicity via
        // approve_supervisor_batch RPC is structural follow-up.
        // TODO(CRACK 69 full closure): wrap in supabase.rpc().
        const { error: flagUpdateError } = await supabase
          .from('shifts')
          .update({ anomaly_flags: merged })
          .eq('id', shift.id);
        if (flagUpdateError) {
          console.error('[handleYesAll] anomaly_flags update failed', { shiftId: shift.id, error: flagUpdateError });
          // RULE_011 is informational — don't block approval on this failure.
        } else {
          (shift as unknown as { anomaly_flags: AnomalyFlag[] }).anomaly_flags = merged;
        }
      }
    }
    await approveShift(supabase, shift, supervisor);
    approvedCodes.push(extractCode(shift.receipt_id));
  }

  // Remove approved codes from pending — Patch 3.6 error capture
  const remainingCodes = pendingCodes.filter((c) => !approvedCodes.includes(c));
  const { error: pendingUpdateErrorYesAll } = await supabase
    .from('supervisors')
    .update({ pending_sms_approval_ids: remainingCodes })
    .eq('id', supervisor.id);
  if (pendingUpdateErrorYesAll) {
    console.error('[handleYesAll] pending_sms_approval_ids update failed', { supervisorId: supervisor.id, error: pendingUpdateErrorYesAll });
    // Approvals already committed; surface but don't block response.
  }

  // Send Resend email to payroll admin
  if (payrollEmail) {
    try {
      // CREDENTIAL REQUIRED: RESEND_API_KEY
      await notifyPayrollAdmin({
        to: payrollEmail,
        supervisorName: supervisor.name,
        method: 'SMS',
        shifts: cleanShifts.map((s) => ({
          workerName: `${s.workers?.first_name ?? 'Unknown'} ${s.workers?.last_name ?? ''}`.trim(),
          site: s.sites?.name ?? 'Unknown',
          hours: parseFloat(s.total_hours ?? '0'),
          date: s.shift_date,
        })),
      });
    } catch {
      // Email failure does not block SMS response
    }
  }

  // Build response
  if (flaggedShifts.length === 0) {
    return twimlResponse(`All approved. ${cleanShifts.length} shifts sent to payroll.`);
  }

  // Patch 3.4 (CRACK 74) — drop worker first names from flagged-list
  const flaggedList = flaggedShifts
    .map((s) => `Shift ${extractCode(s.receipt_id)} still needs individual review. Reply YES ${extractCode(s.receipt_id)} or NO ${extractCode(s.receipt_id)}.`)
    .join(' ');

  return twimlResponse(
    `${cleanShifts.length} clean shift(s) approved. ${flaggedList}`
  );
}

// ─── YES [CODE] handler ─────────────────────────────────────────────────────
async function handleYesCode(
  supabase: ReturnType<typeof createServiceClient>,
  supervisor: SupervisorRow,
  code: string,
  pendingCodes: string[],
  payrollEmail: string
): Promise<Response> {
  // Find the shift by code (Patch 3.8 — filter built into helper)
  const shift = await findShiftByCode(supabase, code, supervisor);
  if (!shift) {
    // Patch 3.3 (CRACK 71) — drop pendingCodes leakage
    return twimlResponse(`Shift code ${code} not found. Reply HELP for instructions.`);
  }

  // Approve the shift
  await approveShift(supabase, shift, supervisor);

  // Remove code from pending — Patch 3.6 error capture
  const shiftCode = extractCode(shift.receipt_id);
  const remainingCodes = pendingCodes.filter((c) => c !== shiftCode);
  const { error: pendingUpdateErrorYes } = await supabase
    .from('supervisors')
    .update({ pending_sms_approval_ids: remainingCodes })
    .eq('id', supervisor.id);
  if (pendingUpdateErrorYes) {
    console.error('[handleYesCode] pending_sms_approval_ids update failed', { supervisorId: supervisor.id, error: pendingUpdateErrorYes });
  }

  // Send notification
  if (payrollEmail) {
    try {
      // CREDENTIAL REQUIRED: RESEND_API_KEY
      await notifyPayrollAdmin({
        to: payrollEmail,
        supervisorName: supervisor.name,
        method: 'SMS',
        shifts: [{
          workerName: `${shift.workers?.first_name ?? 'Unknown'} ${shift.workers?.last_name ?? ''}`.trim(),
          site: shift.sites?.name ?? 'Unknown',
          hours: parseFloat(shift.total_hours ?? '0'),
          date: shift.shift_date,
        }],
      });
    } catch {
      // Email failure does not block SMS response
    }
  }

  const workerName = shift.workers?.first_name ?? 'Worker';
  const hours = parseFloat(shift.total_hours ?? '0').toFixed(1);
  const siteName = shift.sites?.name ?? 'site';

  let reply = `Approved: ${workerName} ${hours}hrs at ${siteName}.`;
  if (remainingCodes.length > 0) {
    reply += ` Still pending: ${remainingCodes.join(', ')}`;
  }

  return twimlResponse(reply);
}

// ─── NO [CODE] handler ──────────────────────────────────────────────────────
async function handleNoCode(
  supabase: ReturnType<typeof createServiceClient>,
  supervisor: SupervisorRow,
  code: string,
  pendingCodes: string[],
  payrollEmail: string
): Promise<Response> {
  const shift = await findShiftByCode(supabase, code, supervisor);
  if (!shift) {
    // Patch 3.3 (CRACK 71) — drop pendingCodes leakage
    return twimlResponse(`Shift code ${code} not found. Reply HELP for instructions.`);
  }

  // Patch 3.2 (CRACK 84) — status guard. Refuse re-disputing already-decided shifts.
  if (shift.status !== 'SUBMITTED') {
    return twimlResponse(`Shift ${code} cannot be disputed (already in ${shift.status}).`);
  }

  // Create DISPUTE_RAISED WLES event
  const now = new Date();
  const eventData = {
    shift_id: shift.id,
    receipt_id: shift.receipt_id,
    method: 'SMS' as const,
    created_by: supervisor.phone,
  };

  // Fail-closed + company_id assertion.
  if (!isWlesV1Enabled()) {
    throw new Error('WLES_V1_ENABLED must be set; v0 writes are blocked at the substrate post-cutover.');
  }
  if (!shift.company_id) {
    throw new Error(`company_id is required for v1 sealing (shift ${shift.id})`);
  }

  const previousEventHash = await getV1ChainTail(
    supabase as unknown as Parameters<typeof getV1ChainTail>[0],
    shift.company_id,
  );
  const unsealed = buildDisputeRaised({
    actorId: supervisor.id,
    subjectId: shift.worker_id,
    timestamp: now.toISOString(),
    previousEventHash,
    shiftId: shift.id,
    reason: 'SMS dispute',
  });
  const sealed = sealEvent(unsealed);
  await insertV1Event(
    supabase as unknown as Parameters<typeof insertV1Event>[0],
    sealed,
    {
      companyId: shift.company_id,
      workerId: shift.worker_id,
      siteId: shift.site_id ?? null,
      createdBy: supervisor.phone,
      eventDataCompat: eventData,
    },
  );

  // Update shift status — Patch 3.6 (CRACK 73, 80) error capture
  const { error: disputeStatusError } = await supabase
    .from('shifts')
    .update({
      status: 'DISPUTED',
      updated_at: now.toISOString(),
    })
    .eq('id', shift.id);
  if (disputeStatusError) {
    console.error('[handleNoCode] DISPUTED status update failed', { shiftId: shift.id, error: disputeStatusError });
    throw new Error(`Status update failed: ${disputeStatusError.message}`);
  }

  // Remove code from pending — Patch 3.6 error capture
  const shiftCode = extractCode(shift.receipt_id);
  const remainingCodes = pendingCodes.filter((c) => c !== shiftCode);
  const { error: pendingUpdateErrorNo } = await supabase
    .from('supervisors')
    .update({ pending_sms_approval_ids: remainingCodes })
    .eq('id', supervisor.id);
  if (pendingUpdateErrorNo) {
    console.error('[handleNoCode] pending_sms_approval_ids update failed', { supervisorId: supervisor.id, error: pendingUpdateErrorNo });
  }

  // Send urgent notification
  if (payrollEmail) {
    try {
      // CREDENTIAL REQUIRED: RESEND_API_KEY
      await notifyPayrollDispute({
        to: payrollEmail,
        supervisorName: supervisor.name,
        workerName: `${shift.workers?.first_name ?? 'Unknown'} ${shift.workers?.last_name ?? ''}`.trim(),
        site: shift.sites?.name ?? 'Unknown',
        hours: parseFloat(shift.total_hours ?? '0'),
        method: 'SMS',
      });
    } catch {
      // Email failure does not block SMS response
    }
  }

  const workerName = shift.workers?.first_name ?? 'Worker';
  return twimlResponse(`Flagged: ${workerName}'s shift queued for payroll review.`);
}

// ─── Helper: approve a single shift ─────────────────────────────────────────
async function approveShift(
  supabase: ReturnType<typeof createServiceClient>,
  shift: ShiftWithWorkerSite,
  supervisor: SupervisorRow
): Promise<void> {
  // Patch 3.1 (CRACK 72, 79) — idempotency + status guard.
  // Refuse to approve a shift that's not in SUBMITTED. JRYMJXWR root cause.
  if (shift.status !== 'SUBMITTED') {
    console.warn('[approveShift] Skipping: shift not in SUBMITTED status', {
      shiftId: shift.id,
      receiptId: shift.receipt_id,
      currentStatus: shift.status,
    });
    return;
  }

  const now = new Date();

  // Create WLES SUPERVISOR_APPROVAL event
  const eventData = {
    shift_id: shift.id,
    receipt_id: shift.receipt_id,
    method: 'SMS' as const,
    approver_phone: supervisor.phone,
    reply: 'SMS_APPROVAL',
  };

  // Fail-closed + company_id assertion.
  if (!isWlesV1Enabled()) {
    throw new Error('WLES_V1_ENABLED must be set; v0 writes are blocked at the substrate post-cutover.');
  }
  if (!shift.company_id) {
    throw new Error(`company_id is required for v1 sealing (shift ${shift.id})`);
  }

  const previousEventHash = await getV1ChainTail(
    supabase as unknown as Parameters<typeof getV1ChainTail>[0],
    shift.company_id,
  );
  const unsealed = buildApproval({
    actorId: supervisor.id,
    subjectId: shift.worker_id,
    timestamp: now.toISOString(),
    previousEventHash,
    shiftId: shift.id,
    approvedHours: typeof shift.total_hours === 'number' ? shift.total_hours : 0,
    approvalMethod: 'sms',
  });
  const sealed = sealEvent(unsealed);
  await insertV1Event(
    supabase as unknown as Parameters<typeof insertV1Event>[0],
    sealed,
    {
      companyId: shift.company_id,
      workerId: shift.worker_id,
      siteId: shift.site_id ?? null,
      createdBy: supervisor.phone,
      eventDataCompat: eventData,
    },
  );

  // Update shift status — Patch 3.6 (CRACK 73, 80) error capture
  const { error: approveStatusError } = await supabase
    .from('shifts')
    .update({
      status: 'SUPERVISOR_APPROVED',
      supervisor_approved_by: supervisor.id,
      supervisor_approved_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', shift.id);
  if (approveStatusError) {
    console.error('[approveShift] Status update failed', { shiftId: shift.id, error: approveStatusError });
    throw new Error(`Status update failed: ${approveStatusError.message}`);
  }

  // Patch 3.7 (CRACK 82, 83) — route through canonical helper.
  // Static import, env validation, proper Twilio result handling.
  // Fail silently: supervisor approval has already succeeded.
  try {
    await sendWorkerApprovedSms(
      {
        id: shift.id,
        worker_id: shift.worker_id,
        receipt_id: shift.receipt_id,
        total_hours: shift.total_hours,
      },
      now,
      supervisor.name,
    );
  } catch (e) {
    console.error('[approveShift] Worker notification failed', { shiftId: shift.id, error: e instanceof Error ? e.message : String(e) });
    // Approval already succeeded — fail silently for SMS notification.
  }
}

// Patch 3.7 (CRACK 82, 83) — sendWorkerVerifiedSms removed.
// Replaced by sendWorkerApprovedSms helper (lib/sms/worker-notify.ts)
// which already does static import, env validation, and proper Twilio
// result handling. Call site updated above in approveShift().

// ─── Helper: find shift by 6-char code ──────────────────────────────────────
async function findShiftByCode(
  supabase: ReturnType<typeof createServiceClient>,
  code: string,
  supervisor: SupervisorRow
): Promise<ShiftWithWorkerSite | null> {
  // Patch 3.8 (CRACK 76) — pendingCodes filter. Without this, supervisor
  // could approve any SUBMITTED shift in their site_ids by replying with
  // its code, even if it was never queued for them. Combined with parser's
  // exact-match-only behaviour (parse.ts companion to Patch 3.12), this
  // closes the authorisation bypass at two layers.
  const pendingIds = supervisor.pending_sms_approval_ids ?? [];
  if (!pendingIds.includes(code.toUpperCase())) {
    return null;
  }

  // receipt_id format: FSTR-XXXXXXXX — code is last 6 chars
  // We search for receipt_id ending with the code
  const { data: shifts } = await supabase
    .from('shifts')
    .select('id, company_id, worker_id, site_id, shift_date, total_hours, receipt_id, status, anomaly_flags, workers(first_name, last_name), sites(name)')
    .eq('status', 'SUBMITTED')
    .in('site_id', supervisor.site_ids ?? []);

  if (!shifts) return null;

  const match = (shifts as unknown as ShiftWithWorkerSite[]).find(
    (s) =>
      extractCode(s.receipt_id).toUpperCase() === code.toUpperCase() &&
      pendingIds.includes(extractCode(s.receipt_id)),
  );

  return match ?? null;
}
