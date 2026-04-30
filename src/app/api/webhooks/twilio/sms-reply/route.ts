// Flostruction — Twilio Inbound SMS Webhook
// POST /api/webhooks/twilio/sms-reply
// Handles supervisor SMS replies: YES ALL, YES [CODE], NO [CODE], HELP
// CRITICAL: Twilio signature validation is the FIRST line of processing.
// Non-negotiable: YES ALL only approves clean shifts (no HIGH/MEDIUM flags).

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { validateTwilioSignature } from '@/lib/twilio/client';
import { parseSMSReply } from '@/lib/sms/parse';
import { extractCode, formatWorkerVerifiedSms } from '@/lib/sms/compose';
import { generateEventHash, type StartTimeSource } from '@/lib/wles/hash';
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

import { routeLogger } from '@/lib/logger';
// CREDENTIAL REQUIRED: TWILIO_AUTH_TOKEN
// CREDENTIAL REQUIRED: RESEND_API_KEY

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
  // L2.1 chunk 3 — second-precision timestamp of the most recent
  // batch SMS send for this supervisor. NULL when no batch tracked.
  last_batch_sms_sent_at: string | null;
}

// ─── Main Route Handler ─────────────────────────────────────────────────────
export async function POST(request: Request): Promise<Response> {
  const log = routeLogger('POST /api/webhooks/twilio/sms-reply', request.headers.get('x-request-id'));
  log.info({ method: 'POST' }, 'request.received');
  // 1. Rate limit check
  const clientIP = getClientIP(request);
  const rl = checkRateLimit(`webhook:${clientIP}`, RATE_LIMITS.WEBHOOK);
  if (!rl.allowed) {
    return new Response('Rate limit exceeded', { status: 429 });
  }

  // 2. Parse the URL-encoded body from Twilio
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

  // 3. CRITICAL: Validate Twilio signature — FIRST line of processing
  const signature = request.headers.get('x-twilio-signature') ?? '';
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/sms-reply`;

  if (!validateTwilioSignature(signature, webhookUrl, formParams)) {
    return new Response('Forbidden', { status: 403 });
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://flosmosis.com';
  const backupUrl = `${appUrl}/v/${sup.verify_token}`;

  // 6. Handle each command type
  switch (parsed.action) {
    case 'YES_ALL': {
      return await handleYesAll(supabase, sup, pendingCodes, payrollEmail, backupUrl);
    }

    case 'YES_CODE': {
      if (!parsed.code) {
        return twimlResponse(`Reply YES followed by a shift code. Codes: ${pendingCodes.join(', ')}. Details: ${backupUrl}`);
      }
      return await handleYesCode(supabase, sup, parsed.code, pendingCodes, payrollEmail);
    }

    case 'NO_CODE': {
      if (!parsed.code) {
        return twimlResponse(`Reply NO followed by a shift code. Codes: ${pendingCodes.join(', ')}. Details: ${backupUrl}`);
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
      return twimlResponse(
        `Reply YES ALL to approve, or YES/NO [code] for one shift. Codes: ${pendingCodes.join(', ')}. Details: ${backupUrl}`
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
    // All shifts are flagged
    const flaggedList = flaggedShifts
      .map((s) => `${s.workers?.first_name}'s shift (${extractCode(s.receipt_id)})`)
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
        await supabase
          .from('shifts')
          .update({ anomaly_flags: merged })
          .eq('id', shift.id);
        // Reflect locally so the in-memory copy passed to approveShift
        // is consistent.
        (shift as unknown as { anomaly_flags: AnomalyFlag[] }).anomaly_flags = merged;
      }
    }
    await approveShift(supabase, shift, supervisor);
    approvedCodes.push(extractCode(shift.receipt_id));
  }

  // Remove approved codes from pending
  const remainingCodes = pendingCodes.filter((c) => !approvedCodes.includes(c));
  await supabase
    .from('supervisors')
    .update({ pending_sms_approval_ids: remainingCodes })
    .eq('id', supervisor.id);

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

  const flaggedList = flaggedShifts
    .map((s) => `${s.workers?.first_name}'s shift (${extractCode(s.receipt_id)}) still needs individual review. Reply YES ${extractCode(s.receipt_id)} or NO ${extractCode(s.receipt_id)}.`)
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
  // Find the shift by code
  const shift = await findShiftByCode(supabase, code, supervisor);
  if (!shift) {
    return twimlResponse(`Shift code ${code} not found. Pending codes: ${pendingCodes.join(', ')}.`);
  }

  // Approve the shift
  await approveShift(supabase, shift, supervisor);

  // Remove code from pending
  const shiftCode = extractCode(shift.receipt_id);
  const remainingCodes = pendingCodes.filter((c) => c !== shiftCode);
  await supabase
    .from('supervisors')
    .update({ pending_sms_approval_ids: remainingCodes })
    .eq('id', supervisor.id);

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
    return twimlResponse(`Shift code ${code} not found. Pending codes: ${pendingCodes.join(', ')}.`);
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

  // Update shift status
  await supabase
    .from('shifts')
    .update({
      status: 'DISPUTED',
      updated_at: now.toISOString(),
    })
    .eq('id', shift.id);

  // Remove code from pending
  const shiftCode = extractCode(shift.receipt_id);
  const remainingCodes = pendingCodes.filter((c) => c !== shiftCode);
  await supabase
    .from('supervisors')
    .update({ pending_sms_approval_ids: remainingCodes })
    .eq('id', supervisor.id);

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

  // Update shift status
  await supabase
    .from('shifts')
    .update({
      status: 'SUPERVISOR_APPROVED',
      supervisor_approved_by: supervisor.id,
      supervisor_approved_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', shift.id);

  // Sprint 6 — notify the worker that their shift is verified.
  // Fail silently: supervisor approval has already succeeded.
  try {
    await sendWorkerVerifiedSms(supabase, shift, now, supervisor.name);
  } catch {
    // Log via intelligence_flags (LOW severity) in a future iteration.
  }
}

// Sprint 6 — post-approval worker notification.
// Loads phone + Sprint-6 provenance columns; fails silently if any
// step goes wrong so the supervisor reply is never blocked.
//
// supervisorName surfaced 2026-04-30 evening per Blocker 2 — SMS body
// now reads "Approved by <name> at <time>" instead of the prior
// "Approved: <time> AEST" technical line.
async function sendWorkerVerifiedSms(
  supabase: ReturnType<typeof createServiceClient>,
  shift: ShiftWithWorkerSite,
  approvedAt: Date,
  supervisorName: string,
): Promise<void> {
  const { data: workerRow } = await supabase
    .from('workers')
    .select('phone')
    .eq('id', shift.worker_id)
    .single();
  if (!workerRow?.phone) return;

  // Refresh shift to pull the Sprint-6 provenance columns. These may
  // be absent if the Task 1 migration has not yet been applied; in
  // that case we fall back to a minimal MANUAL-style message.
  const { data: shiftRow } = await supabase
    .from('shifts')
    .select('start_time, geofence_detected_at, worker_confirmed_start_at, start_time_source')
    .eq('id', shift.id)
    .single();

  const startSource =
    (shiftRow as { start_time_source?: StartTimeSource } | null)?.start_time_source ?? 'MANUAL';
  const geofenceDetectedAt =
    (shiftRow as { geofence_detected_at?: string } | null)?.geofence_detected_at ?? null;
  const workerConfirmedStartAt =
    (shiftRow as { worker_confirmed_start_at?: string; start_time?: string } | null)
      ?.worker_confirmed_start_at ??
    (shiftRow as { start_time?: string } | null)?.start_time ??
    approvedAt.toISOString();

  const body = formatWorkerVerifiedSms({
    receiptId: shift.receipt_id,
    hoursWorked: shift.total_hours ?? '0',
    startSource,
    geofenceDetectedAt,
    workerConfirmedStartAt,
    approvedAt: approvedAt.toISOString(),
    supervisorName,
    // G12 fix 2026-04-30 evening — link target moved from public
    // /receipt/<id> to field-internal /field/receipt/<id> so the
    // worker arrives in their authenticated app context (with nav
    // to /field/records and /field/home), not on the public verifier
    // surface. The public route remains for explicit share via the
    // ShareLinkButton on the receipt page. Field-internal route
    // accepts the same FSTR receipt_id as its [receiptId] segment.
    publicReceiptUrl: `https://flosmosis.com/field/receipt/${shift.receipt_id}`,
  });

  // Send via the same Twilio client the inbound webhook already uses.
  const { getTwilioClient } = await import('@/lib/twilio/client');
  const client = getTwilioClient();
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!from) return;
  await client.messages.create({ body, from, to: workerRow.phone });
}

// ─── Helper: find shift by 6-char code ──────────────────────────────────────
async function findShiftByCode(
  supabase: ReturnType<typeof createServiceClient>,
  code: string,
  supervisor: SupervisorRow
): Promise<ShiftWithWorkerSite | null> {
  // receipt_id format: FSTR-XXXXXXXX — code is last 6 chars
  // We search for receipt_id ending with the code
  const { data: shifts } = await supabase
    .from('shifts')
    .select('id, company_id, worker_id, site_id, shift_date, total_hours, receipt_id, status, anomaly_flags, workers(first_name, last_name), sites(name)')
    .eq('status', 'SUBMITTED')
    .in('site_id', supervisor.site_ids ?? []);

  if (!shifts) return null;

  const match = (shifts as unknown as ShiftWithWorkerSite[]).find(
    (s) => extractCode(s.receipt_id).toUpperCase() === code.toUpperCase()
  );

  return match ?? null;
}
