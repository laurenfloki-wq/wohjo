// Flostruction — Worker-side SMS notification helpers
//
// Sends SMS to the worker on key WLES events that affect their shift:
// SUPERVISOR_APPROVAL (approved) and DISPUTE_RAISED (challenged). Same
// records-substrate framing as the supervisor-side path: the underlying
// state change is the WLES event; this helper is the human-facing
// observable that lets the worker know to look at the receipt.
//
// HISTORY
//
// Pre-2026-04-30, post-approval worker SMS was emitted only from
// /api/webhooks/twilio/sms-reply (the SMS-reply path). Web-based
// supervisor approval at /api/verify/approve/[shiftId] and
// admin/employer approval at /api/command/shifts/[shiftId]/approve
// did not notify the worker — the worker had to refresh the receipt
// page to see the status change. Same gap on the dispute side. This
// module consolidates worker-notification into a single shared helper
// so every approval and dispute path notifies consistently.
//
// Reference: labour-hire-workflow-gap-analysis-2026-04-29 §2.6 + §2.7
// (worker-notification flow + dispute flow recon).
//
// Non-blocking: callers should invoke as fire-and-forget. SMS failure
// must never roll back the underlying approval/dispute event.
//
// CREDENTIAL REQUIRED: TWILIO_ACCOUNT_SID
// CREDENTIAL REQUIRED: TWILIO_AUTH_TOKEN
// CREDENTIAL REQUIRED: TWILIO_FROM_NUMBER

import { createServiceClient } from '@/lib/supabase/server';
import { getTwilioClient, getTwilioFromNumber } from '@/lib/twilio/client';
import { formatWorkerVerifiedSms } from '@/lib/sms/compose';
// B4 / SG-5 (2026-06-12): failed sends are recorded as dead letters so
// a Twilio outage is visible (substrate-health 'notification_outbound')
// and operator-replayable. Throw semantics unchanged.
import { recordNotificationDeadLetter } from '@/lib/notify/dead-letter';

type StartTimeSource = 'MANUAL' | 'GEOFENCE_CONFIRMED' | 'GEOFENCE_ADJUSTED';

interface ShiftLite {
  id: string;
  worker_id: string;
  receipt_id: string;
  total_hours: string | null;
}

/**
 * Send the post-approval verified-shift SMS to the worker. Same body
 * format as the existing /api/webhooks/twilio/sms-reply path.
 *
 * supervisorName is the human display name from supervisors.name —
 * surfaced in the SMS body ("Approved by <name> at <time>") so the
 * worker sees who approved their hours, not just an anonymous time.
 * Required parameter as of Blocker 2 (2026-04-30 evening).
 */
export async function sendWorkerApprovedSms(
  shift: ShiftLite,
  approvedAt: Date,
  supervisorName: string,
): Promise<void> {
  const supabase = createServiceClient();

  const { data: workerRow } = await supabase
    .from('workers')
    .select('phone')
    .eq('id', shift.worker_id)
    .single();
  if (!workerRow?.phone) return;

  // Refresh shift for provenance columns — these may not be present
  // in early environments (Sprint 6 Task 1 migration); fall back to
  // MANUAL with start_time if absent.
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
    publicReceiptUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.flosmosis.com'}/field/receipt/${shift.receipt_id}`,
  });

  const client = getTwilioClient();
  const from = getTwilioFromNumber();
  if (!from) return;
  try {
    await client.messages.create({ body, from, to: workerRow.phone });
  } catch (err) {
    await recordNotificationDeadLetter({
      channel: 'twilio_sms',
      recipient: workerRow.phone,
      summary: { kind: 'worker_approved_sms' },
      error: err instanceof Error ? err.message : String(err),
      context: { shift_id: shift.id, receipt_id: shift.receipt_id },
    });
    throw err;
  }
}

/**
 * Send the dispute-raised SMS to the worker so they know their hours
 * are being challenged and can open the receipt to see the supervisor's
 * stated reason. Records-substrate framing: the dispute itself is the
 * DISPUTE_RAISED WLES event; this SMS is the human-facing observable.
 */
export async function sendWorkerDisputeSms(shift: ShiftLite, reason: string): Promise<void> {
  const supabase = createServiceClient();

  const { data: workerRow } = await supabase
    .from('workers')
    .select('phone, first_name')
    .eq('id', shift.worker_id)
    .single();
  if (!workerRow?.phone) return;

  // Truncate reason for SMS — full reason is on the receipt page.
  const truncatedReason = reason.length > 80 ? `${reason.slice(0, 77)}...` : reason;

  const body = [
    'FLOSTRUCTION — Shift queried.',
    shift.receipt_id,
    `Hours: ${shift.total_hours ?? '0'}`,
    `Supervisor note: ${truncatedReason}`,
    `Open: ${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.flosmosis.com'}/field/receipt/${shift.receipt_id}`,
  ].join('\n');

  const client = getTwilioClient();
  const from = getTwilioFromNumber();
  if (!from) return;
  try {
    await client.messages.create({ body, from, to: workerRow.phone });
  } catch (err) {
    await recordNotificationDeadLetter({
      channel: 'twilio_sms',
      recipient: workerRow.phone,
      summary: { kind: 'worker_dispute_sms' },
      error: err instanceof Error ? err.message : String(err),
      context: { shift_id: shift.id, receipt_id: shift.receipt_id },
    });
    throw err;
  }
}
