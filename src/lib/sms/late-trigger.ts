// Flostruction — Late Submission SMS Trigger
// When a SHIFT_COMMIT event occurs after 16:30 AEST and the supervisor's
// batch SMS has already been sent today, send an immediate individual SMS.
// Called from POST /api/field/shift/end after SHIFT_COMMIT.

import { createServiceClient } from '@/lib/supabase/server';
import { getTwilioClient, getTwilioFromNumber } from '@/lib/twilio/client';
import { composeLateShiftSMS, extractCode, type ShiftForSMS } from '@/lib/sms/compose';
import type { AnomalyFlag } from '@/lib/intelligence/rules';

// CREDENTIAL REQUIRED: TWILIO_ACCOUNT_SID
// CREDENTIAL REQUIRED: TWILIO_AUTH_TOKEN
// CREDENTIAL REQUIRED: TWILIO_FROM_NUMBER

/**
 * Check if current time is after 16:30 AEST and send immediate SMS if so.
 * Non-blocking — errors are silently caught (never fails the submission).
 */
export async function triggerLateSubmissionSMS(shiftId: string): Promise<void> {
  // Check AEST time
  const nowUTC = new Date();
  const aestOffset = 10 * 60 * 60 * 1000;
  const nowAEST = new Date(nowUTC.getTime() + aestOffset);
  const aestHour = nowAEST.getHours();
  const aestMinute = nowAEST.getMinutes();

  // Only trigger after 16:30 AEST
  if (aestHour < 16 || (aestHour === 16 && aestMinute < 30)) {
    return;
  }

  const todayAEST = nowAEST.toISOString().split('T')[0];
  const supabase = createServiceClient();

  // Fetch the shift with worker and site info
  const { data: shift } = await supabase
    .from('shifts')
    .select('id, company_id, worker_id, site_id, shift_date, total_hours, receipt_id, status, anomaly_flags')
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
    .select('name')
    .eq('id', shift.site_id)
    .single();

  // Find supervisors for this site who already got today's batch
  const { data: supervisors } = await supabase
    .from('supervisors')
    .select('id, phone, site_ids, pending_sms_approval_ids, last_batch_sms_date, verify_token')
    .eq('is_active', true)
    .eq('last_batch_sms_date', todayAEST);

  if (!supervisors) return;

  const relevantSupervisors = supervisors.filter(
    (s: { site_ids: string[] | null }) => s.site_ids?.includes(shift.site_id)
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://flosmosis.com';
  const code = extractCode(shift.receipt_id);

  for (const sup of relevantSupervisors) {
    const backupUrl = `${appUrl}/v/${sup.verify_token}`;
    const message = composeLateShiftSMS({ shift: shiftForSMS, backupUrl });

    await twilioClient.messages.create({
      to: sup.phone,
      from: fromNumber,
      body: message,
    });

    // Add code to pending_sms_approval_ids
    const existingCodes = (sup.pending_sms_approval_ids ?? []) as string[];
    if (!existingCodes.includes(code)) {
      await supabase
        .from('supervisors')
        .update({
          pending_sms_approval_ids: [...existingCodes, code],
        })
        .eq('id', sup.id);
    }
  }
}
