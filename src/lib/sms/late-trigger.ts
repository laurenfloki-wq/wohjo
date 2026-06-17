// Flostruction — Supervisor SMS Inline Trigger
//
// Called from POST /api/field/shift/end after SHIFT_COMMIT. Sends an
// immediate individual SMS to each active supervisor at the shift's site,
// regardless of time of day, with per-(supervisor, shift) idempotency so
// the same shift never produces a duplicate SMS to the same supervisor.
//
// HISTORY
//
// Pre-2026-04-30: this trigger only fired after 16:30 AEST AND only to
// supervisors who had already received the day's batch SMS (i.e., whose
// last_batch_sms_date == today). That design produced a silent no-op
// for shifts ending before 16:30 AEST and for shifts ending after 16:30
// when the day had no earlier batch (which happens on a single-shift
// soft-launch tenant — Joao's Mt Stromlo case).
//
// Post-2026-04-30 (G1 Tier 1 per labour-hire-workflow-gap-analysis-
// 2026-04-29 §2.G1): the time-of-day guard and the
// last_batch_sms_date filter are both removed. The inline path now
// fires on every clock-off. The 16:30 AEST batch cron continues to run
// unchanged (per gap analysis) — but since this trigger stamps
// last_batch_sms_date when it sends, the cron correctly skips
// already-primed supervisors and no double-SMS is produced. Per-shift
// idempotency via pending_sms_approval_ids prevents the same shift's
// code from generating a second SMS to the same supervisor even if
// this trigger is somehow invoked twice.
//
// CREDENTIAL REQUIRED: TWILIO_ACCOUNT_SID
// CREDENTIAL REQUIRED: TWILIO_AUTH_TOKEN
// CREDENTIAL REQUIRED: TWILIO_FROM_NUMBER

import { createServiceClient } from '@/lib/supabase/server';
import { getTwilioClient, getTwilioFromNumber } from '@/lib/twilio/client';
import { composeLateShiftSMS, extractCode, type ShiftForSMS } from '@/lib/sms/compose';
import type { AnomalyFlag } from '@/lib/intelligence/rules';
// B4 / SG-5: failed supervisor sends are recorded as dead letters so an
// unreachable/invalid number is visible (substrate-health 'notification_outbound'),
// matching the worker-notify path. Recording never throws.
import { recordNotificationDeadLetter } from '@/lib/notify/dead-letter';

interface SupervisorRow {
  id: string;
  phone: string;
  site_ids: string[] | null;
  pending_sms_approval_ids: string[] | null;
  // Migration 2.0 (2026-05-06) renamed last_batch_sms_date (DATE) to
  // last_batch_sms_sent_at (TIMESTAMPTZ). Selecting the old name 400'd.
  last_batch_sms_sent_at: string | null;
  verify_token: string;
}

/**
 * Send an immediate supervisor SMS for a freshly-submitted shift.
 *
 * Filters: supervisors with is_active=true whose site_ids array contains
 * the shift's site_id. No time-of-day gate. No last_batch_sms_date gate.
 *
 * Per-(supervisor, shift) idempotency: the shift's 6-character code is
 * checked against the supervisor's pending_sms_approval_ids array; if
 * already present, the SMS is skipped for that supervisor. This makes
 * the function safe to invoke multiple times for the same shift (e.g.
 * a retry path or a fire-and-forget invocation that is mistakenly
 * called twice) without spamming the supervisor.
 *
 * Non-blocking: errors are caught at the call site (POST shift/end)
 * via .catch(() => ...) and never fail the worker's submission.
 */
export async function triggerLateSubmissionSMS(shiftId: string): Promise<void> {
  const supabase = createServiceClient();

  // Fetch the shift with worker and site info.
  const { data: shift } = await supabase
    .from('shifts')
    .select(
      'id, company_id, worker_id, site_id, shift_date, total_hours, receipt_id, status, anomaly_flags',
    )
    .eq('id', shiftId)
    .single();

  if (!shift || shift.status !== 'SUBMITTED') return;

  const { data: worker } = await supabase
    .from('workers')
    .select('first_name, last_name')
    .eq('id', shift.worker_id)
    .single();

  const { data: site } = await supabase
    .from('sites')
    .select('name, supervisor_is_director')
    .eq('id', shift.site_id)
    .single();

  // "Supervisor = director" sites: the one person clears both gates from the
  // dashboard in a single combined approval, so there is no supervisor to
  // text. Skip the SMS entirely (you don't text yourself).
  if ((site as { supervisor_is_director?: boolean } | null)?.supervisor_is_director) {
    return;
  }

  // Find every active supervisor whose site_ids includes this site.
  // No last_batch_sms_date filter — we want the inline path to be the
  // primary delivery mechanism, with the daily cron as a catch-up.
  const { data: supervisors } = await supabase
    .from('supervisors')
    .select('id, phone, site_ids, pending_sms_approval_ids, last_batch_sms_sent_at, verify_token')
    .eq('is_active', true);

  if (!supervisors) return;

  const relevantSupervisors = (supervisors as SupervisorRow[]).filter(
    (s) => s.site_ids?.includes(shift.site_id) ?? false,
  );

  if (relevantSupervisors.length === 0) return;

  const shiftForSMS: ShiftForSMS = {
    receiptId: shift.receipt_id,
    workerFirstName: worker?.first_name ?? 'Unknown',
    workerLastName: worker?.last_name ?? '',
    totalHours: parseFloat(shift.total_hours ?? '0'),
    siteName: site?.name ?? 'Unknown site',
    anomalyFlags: (shift.anomaly_flags ?? []) as AnomalyFlag[],
  };

  const twilioClient = getTwilioClient();
  const fromNumber = getTwilioFromNumber();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.flosmosis.com';
  const code = extractCode(shift.receipt_id);

  // Today's date in AEST for last_batch_sms_date stamping.
  const nowUTC = new Date();
  const aestOffset = 10 * 60 * 60 * 1000;
  const nowAEST = new Date(nowUTC.getTime() + aestOffset);
  const todayAEST = nowAEST.toISOString().split('T')[0];

  for (const sup of relevantSupervisors) {
    // Atomic check-and-append via the append_sms_code_if_absent
    // function (migrations/202604301700_atomic_sms_idempotency.sql).
    // Pre-2026-04-30-evening: a read-then-update pattern raced under
    // concurrent invocation — two simultaneous calls for the same
    // shift could both observe the code as absent and both fire SMS,
    // and two calls for *different* shifts arriving in the same read
    // window could overwrite each other's appended code. The function
    // performs the check, append, and stamp atomically inside a
    // single UPDATE protected by a contains predicate; PostgreSQL's
    // row-level exclusive lock serialises concurrent attempts so
    // exactly one succeeds and the others see the code already
    // present and return zero rows.
    //
    // Order matters: the rpc claims the slot first, then we send the
    // SMS. If Twilio fails after the claim, the supervisor's pending
    // list shows the shift but no SMS arrived — degraded but not
    // duplicated. At-most-once is the correct trade-off for SMS
    // notifications about a sealed record.
    const { data: claimedRows, error: claimErr } = await supabase.rpc('append_sms_code_if_absent', {
      p_supervisor_id: sup.id,
      p_code: code,
      p_today: todayAEST,
      p_now: new Date().toISOString(),
    });

    if (claimErr) {
      // Function should always be present in production after the
      // 2026-04-30 migration applies; if absent (pre-migration
      // environment, or rollback) we fail closed — better to skip a
      // notification than to risk a duplicate.
      continue;
    }

    const claimed = Array.isArray(claimedRows) && claimedRows.length > 0;
    if (!claimed) {
      // Code already in this supervisor's pending list for this shift.
      // Either a prior invocation of this trigger already notified
      // them, or the daily batch cron already included this shift.
      // Either way, no second SMS.
      continue;
    }

    // Deployed supervisor page is /verify?token=… (src/app/(verify)/verify);
    // the old /v/<token> short link had no route and 404'd on click.
    const backupUrl = `${appUrl}/verify?token=${sup.verify_token}`;
    const message = composeLateShiftSMS({ shift: shiftForSMS, backupUrl });

    try {
      await twilioClient.messages.create({
        to: sup.phone,
        from: fromNumber,
        body: message,
      });
    } catch (err) {
      // Record the failed send so an unreachable/invalid supervisor number is
      // visible instead of being silently swallowed by the route's
      // fire-and-forget .catch. Continue — one bad number must not stop the
      // other supervisors.
      await recordNotificationDeadLetter({
        channel: 'twilio_sms',
        recipient: sup.phone,
        summary: { kind: 'supervisor_approval_sms', shift_count: 1 },
        error: err instanceof Error ? err.message : String(err),
        context: { shift_id: shift.id, receipt_id: shift.receipt_id, supervisor_id: sup.id },
      });
    }
  }
}
