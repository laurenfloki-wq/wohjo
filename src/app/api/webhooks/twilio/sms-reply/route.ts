// Flostruction — Twilio Inbound SMS Webhook
// POST /api/webhooks/twilio/sms-reply
// Handles supervisor SMS replies: YES ALL, YES [CODE], NO [CODE], HELP
// CRITICAL: Twilio signature validation runs before any state-mutating
// operation. Rate limit moved after signature validation per CRACK 102 fix.
// Non-negotiable: YES ALL only approves clean shifts (no HIGH/MEDIUM flags).

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { validateTwilioSignature } from '@/lib/twilio/client';
import { parseSMSReply } from '@/lib/sms/parse';
import { extractCode } from '@/lib/sms/compose';
import { generateEventHash } from '@/lib/wles/hash';
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
// Patch 3.7 — replace truncated sendWorkerVerifiedSms with the canonical
// helper from lib/sms/worker-notify.ts (static import, env validation,
// proper Twilio result handling). Closes CRACK 82, 83.
import { sendWorkerApprovedSms } from '@/lib/sms/worker-notify';

import { routeLogger } from '@/lib/logger';
// CREDENTIAL REQUIRED: TWILIO_AUTH_TOKEN
// CREDENTIAL REQUIRED: RESEND_API_KEY

// Patch 3.9 — env startup warning for TWILIO_FROM_NUMBER (CRACK 81).
// Module-level log only; runtime validation happens inside the helper
// (lib/sms/worker-notify.ts via getTwilioFromNumber()). Avoid throwing
// here so a missing env var doesn't crash route initialisation.
if (!process.env.TWILIO_FROM_NUMBER) {
  console.error('[startup] TWILIO_FROM_NUMBER missing from env — worker confirmation SMS will fail');
}

// Patch 3.13 — fail fast if NEXT_PUBLIC_APP_URL is unset (CRACK 111).
// Webhook signature validation depends on this URL matching exactly
// what's configured in Twilio Console. A wrong fallback silently
// breaks signature checks. Validate at module level (warn) and again
// inside POST (return 500 if missing) so the route fails loud.
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
  // Patch 5.4 #1 — column renamed in Migration 2.0 (6 May 2026) from
  // last_batch_sms_date (DATE) to last_batch_sms_sent_at (TIMESTAMPTZ).
  // RULE_011 latency calc gains sub-minute precision per CRACK 11/67/98.
  last_batch_sms_sent_at: string | null;
}

// ─── Main Route Handler ─────────────────────────────────────────────────────
export async function POST(request: Request): Promise<Response> {
  const log = routeLogger('POST /api/webhooks/twilio/sms-reply', request.headers.get('x-request-id'));
  log.info({ method: 'POST' }, 'request.received');

  // Patch 3.13 — runtime guard. Module-level warn already fired at boot.
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

  // 2. CRITICAL: Validate Twilio signature BEFORE rate limit (CRACK 102 fix).
  // An attacker who spams unsigned webhooks shouldn't be able to deplete
  // the rate-limit budget reserved for legitimate Twilio traffic.
  const signature = request.headers.get('x-twilio-signature') ?? '';
  const webhookUrl = `${APP_URL}/api/webhooks/twilio/sms-reply`;

  if (!validateTwilioSignature(signature, webhookUrl, formParams)) {
    return new Response('Forbidden', { status: 403 });
  }

  // 3. Rate limit (Patch 3.10 — moved after signature validation per CRACK 102).
  // Note: getClientIP trusts X-Forwarded-For; validation against Vercel's
  // edge IP chain is post-pilot work. Acceptable now because rate limit
  // only fires after signature check has authenticated the caller.
  const clientIP = getClientIP(request);
  const rl = checkRateLimit(`webhook:${clientIP}`, RATE_LIMITS.WEBHOOK);
  if (!rl.allowed) {
    return new Response('Rate limit exceeded', { status: 429 });
  }

  // 4. A2 idempotency guard — Twilio retries failed webhook deliveries with
  // the same MessageSid. If we've seen this SID already, don't reprocess.
  // Done AFTER signature validation so a malicious caller can't pollute
  // our idempotency table with forged keys.
  const messageSid = formParams.MessageSid ?? '';
  if (messageSid) {
    const { duplicate, firstSeenAt } = await checkAndRecordWebhookIdempotency(
      'twilio',
      messageSid,
      '/api/webhooks/twilio/sms-reply',
    );
    if (duplicate) {
      log.info({ messageSid, firstSeenAt }, 'webhook.replay.ignored');
      return twimlResponse('');
    }
  } else {
    log.warn({ formParamKeys: Object.keys(formParams) }, 'webhook.twilio.missing_message_sid');
  }

  const fromPhone = formParams.From ?? '';
  const body = (formParams.Body ?? '').trim();

  const supabase = createServiceClient();

  // 5. Look up supervisor by phone (Patch 5.4 #2 — column rename in SELECT)
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

  // 6. Parse the SMS reply
  const parsed = parseSMSReply(body, pendingCodes);

  // 7. Get company contact email for notifications
  const { data: company } = await supabase
    .from('companies')
    .select('contact_email')
    .eq('id', sup.company_id)
    .single();

  const payrollEmail = company?.contact_email ?? '';
  const backupUrl = `${APP_URL}/v/${sup.verify_token}`;

  // 8. Handle each command type
  switch (parsed.action) {
    case 'YES_ALL': {
      return await handleYesAll(supabase, sup, pendingCodes, payrollEmail, backupUrl);
    }

    case 'YES_CODE': {
      // Patch 3.3 — drop pendingCodes leakage (CRACK 71)
      if (!parsed.code) {
        return twimlResponse(`Reply YES followed by a shift code. Reply HELP for instructions. Details: ${backupUrl}`);
      }
      // Patch 3.12 — explicit code-membership check (CRACK 110).
      // parseSMSReply returns 'YES_CODE' even when code is not in pendingCodes;
      // belt-and-braces reject before dispatching.
      if (!pendingCodes.includes(parsed.code.toUpperCase())) {
        return twimlResponse(`Shift code ${parsed.code} is not in your pending approvals. Reply HELP for instructions.`);
      }
      return await handleYesCode(supabase, sup, parsed.code, pendingCodes, payrollEmail);
    }

    case 'NO_CODE': {
      // Patch 3.3 — drop pendingCodes leakage (CRACK 71)
      if (!parsed.code) {
        return twimlResponse(`Reply NO followed by a shift code. Reply HELP for instructions. Details: ${backupUrl}`);
      }
      // Patch 3.12 — explicit code-membership check (CRACK 110)
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
      // Patch 3.3 — drop pendingCodes leakage (CRACK 71)
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
    // All shifts are flagged — Patch 3.4: drop worker first names
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
  // Patch 5.4 #3 — Migration 2.0 (6 May 2026) renamed the column from
  // last_batch_sms_date (DATE) to last_batch_sms_sent_at (TIMESTAMPTZ),
  // restoring sub-minute precision. RULE_011 now functions as designed.
  let rule011Flag: AnomalyFlag | null = null;
  // Patch 5.4 #4 — column rename
  if (supervisor.last_batch_sms_sent_at && cleanShifts.length >= 3) {
    const replyLatencySeconds = Math.max(
      0,
      Math.round(
        // Patch 5.4 #5 — column rename
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
  // Patch 3.5 (partial) — error capture added; full atomicity via
  // approve_supervisor_batch RPC is a structural follow-up after
  // companion SQL function is deployed. TODO(CRACK 69 full closure):
  // wrap loop in supabase.rpc('approve_supervisor_batch', ...).
  const approvedCodes: string[] = [];
  for (const shift of cleanShifts) {
    if (rule011Flag) {
      const existingFlags = (shift.anomaly_flags ?? []) as AnomalyFlag[];
      const alreadyFlagged = existingFlags.some(
        (f) => f.ruleId === 'RULE_011',
      );
      if (!alreadyFlagged) {
        const merged = [...existingFlags, rule011Flag];
        const { error: flagUpdateError } = await supabase
          .from('shifts')
          .update({ anomaly_flags: merged })
          .eq('id', shift.id);
        if (flagUpdateError) {
          console.error('[handleYesAll] anomaly_flags update failed', { shiftId: shift.id, error: flagUpdateError });
          // Don't throw — RULE_011 is informational, approval still proceeds.
        } else {
          (shift as unknown as { anomaly_flags: AnomalyFlag[] }).anomaly_flags = merged;
        }
      }
    }
    await approveShift(supabase, shift, supervisor);
    approvedCodes.push(extractCode(shift.receipt_id));
  }

  // Remove approved codes from pending
  const remainingCodes = pendingCodes.filter((c) => !approvedCodes.includes(c));
  const { error: pendingUpdateError } = await supabase
    .from('supervisors')
    .update({ pending_sms_approval_ids: remainingCodes })
    .eq('id', supervisor.id);
  if (pendingUpdateError) {
    console.error('[handleYesAll] pending_sms_approval_ids update failed', { supervisorId: supervisor.id, error: pendingUpdateError });
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

  // Patch 3.4 — drop worker first names from flagged-list reply
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
  // Find the shift by code (Patch 3.8 — pendingCodes filter built into helper)
  const shift = await findShiftByCode(supabase, code, supervisor);
  if (!shift) {
    // Patch 3.3 — drop pendingCodes leakage (CRACK 71)
    return twimlResponse(`Shift code ${code} not found. Reply HELP for instructions.`);
  }

  // Approve the shift
  await approveShift(supabase, shift, supervisor);

  // Remove code from pending
  const shiftCode = extractCode(shift.receipt_id);
  const remainingCodes = pendingCodes.filter((c) => c !== shiftCode);
  const { error: pendingUpdateError } = await supabase
    .from('supervisors')
    .update({ pending_sms_approval_ids: remainingCodes })
    .eq('id', supervisor.id);
  if (pendingUpdateError) {
    console.error('[handleYesCode] pending_sms_approval_ids update failed', { supervisorId: supervisor.id, error: pendingUpdateError });
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
    // Patch 3.3 — drop pendingCodes leakage (CRACK 71)
    return twimlResponse(`Shift code ${code} not found. Reply HELP for instructions.`);
  }

  // Patch 3.2 — status guard (CRACK 84). Refuse re-disputing already-decided shifts.
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

  const { data: lastEvent } = await supabase
    .from('shift_events')
    .select('event_hash')
    .eq('worker_id', shift.worker_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const previousHash = lastEvent?.event_hash ?? null;

  if (isWlesV1Enabled() && shift.company_id) {
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
  } else {
    const hash = generateEventHash({
      company_id: shift.company_id,
      worker_id: shift.worker_id,
      site_id: shift.site_id,
      event_type: 'DISPUTE_RAISED',
      event_data: eventData,
      created_at: now,
    });

    await supabase.from('shift_events').insert({
      company_id: shift.company_id,
      worker_id: shift.worker_id,
      site_id: shift.site_id,
      event_type: 'DISPUTE_RAISED',
      event_data: eventData,
      device_metadata: {},
      event_hash: hash,
      previous_event_hash: previousHash,
      created_at: now.toISOString(),
      created_by: supervisor.phone,
      spec_version: '0',
    });
  }

  // Update shift status — Patch 3.6 (CRACK 73, 80): capture error
  const { error: statusUpdateError } = await supabase
    .from('shifts')
    .update({
      status: 'DISPUTED',
      updated_at: now.toISOString(),
    })
    .eq('id', shift.id);
  if (statusUpdateError) {
    console.error('[handleNoCode] DISPUTED status update failed', { shiftId: shift.id, error: statusUpdateError });
    throw new Error(`Status update failed: ${statusUpdateError.message}`);
  }

  // Remove code from pending
  const shiftCode = extractCode(shift.receipt_id);
  const remainingCodes = pendingCodes.filter((c) => c !== shiftCode);
  const { error: pendingUpdateError } = await supabase
    .from('supervisors')
    .update({ pending_sms_approval_ids: remainingCodes })
    .eq('id', supervisor.id);
  if (pendingUpdateError) {
    console.error('[handleNoCode] pending_sms_approval_ids update failed', { supervisorId: supervisor.id, error: pendingUpdateError });
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
  // Patch 3.1 — idempotency + status guard (CRACK 72, 79).
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

  const { data: lastEvent } = await supabase
    .from('shift_events')
    .select('event_hash')
    .eq('worker_id', shift.worker_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const previousHash = lastEvent?.event_hash ?? null;

  if (isWlesV1Enabled() && shift.company_id) {
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
  } else {
    const hash = generateEventHash({
      company_id: shift.company_id,
      worker_id: shift.worker_id,
      site_id: shift.site_id,
      event_type: 'SUPERVISOR_APPROVAL',
      event_data: eventData,
      created_at: now,
    });

    await supabase.from('shift_events').insert({
      company_id: shift.company_id,
      worker_id: shift.worker_id,
      site_id: shift.site_id,
      event_type: 'SUPERVISOR_APPROVAL',
      event_data: eventData,
      device_metadata: {},
      event_hash: hash,
      previous_event_hash: previousHash,
      created_at: now.toISOString(),
      created_by: supervisor.phone,
      spec_version: '0',
    });
  }

  // Update shift status — Patch 3.6 (CRACK 73, 80): capture error
  const { error: statusUpdateError } = await supabase
    .from('shifts')
    .update({
      status: 'SUPERVISOR_APPROVED',
      supervisor_approved_by: supervisor.id,
      supervisor_approved_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', shift.id);
  if (statusUpdateError) {
    console.error('[approveShift] Status update failed', { shiftId: shift.id, error: statusUpdateError });
    throw new Error(`Status update failed: ${statusUpdateError.message}`);
  }

  // Patch 3.7 — route through canonical helper. Static import, env
  // validation, proper Twilio result handling. Closes CRACK 82, 83.
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

// ─── Helper: find a shift by 6-char code ────────────────────────────────────
// Patch 3.8 — pendingCodes filter built in (CRACK 76 closure).
// Without this filter, a supervisor could approve any SUBMITTED shift in
// their site_ids by replying with its code, even if it was never queued
// for them. Combined with parseSMSReply's exact-match-only behaviour
// (parse.ts companion to Patch 3.12), this closes the authorisation
// bypass at two layers.
async function findShiftByCode(
  supabase: ReturnType<typeof createServiceClient>,
  code: string,
  supervisor: SupervisorRow,
): Promise<ShiftWithWorkerSite | null> {
  const pendingIds = supervisor.pending_sms_approval_ids ?? [];
  // Belt-and-braces: if the code isn't in pendingCodes, there's nothing
  // to find. Caller (route POST handler) already does this check via
  // Patch 3.12 — this is the second layer.
  if (!pendingIds.includes(code.toUpperCase())) {
    return null;
  }

  const { data: shifts } = await supabase
    .from('shifts')
    .select('id, company_id, worker_id, site_id, shift_date, total_hours, receipt_id, status, anomaly_flags, workers(first_name, last_name), sites(name)')
    .eq('status', 'SUBMITTED')
    .in('site_id', supervisor.site_ids ?? []);

  if (!shifts || shifts.length === 0) {
    return null;
  }

  const match = (shifts as unknown as ShiftWithWorkerSite[]).find(
    (s) =>
      extractCode(s.receipt_id).toUpperCase() === code.toUpperCase() &&
      pendingIds.includes(extractCode(s.receipt_id)),
  );
  return match ?? null;
}
