// Phase 3 / OBS-2 — out-of-band ops alert via SMS (Twilio).
//
// This channel is INDEPENDENT of Resend, so it still lands when email delivery
// itself is down — the exact failure mode that hid the original 3-day outage
// (every alert rode the one broken email key). Reserved for genuinely critical
// RED so the daily crons can't SMS-spam. No-op (with a loud error log) when
// OPS_ALERT_PHONE is unset, so a missing destination is visible, not silent.

import { getTwilioClient, getTwilioFromNumber, smsStatusCallbackOpts } from '@/lib/twilio/client';
import { recordNotificationDeadLetter } from '@/lib/notify/dead-letter';
import { routeLogger } from '@/lib/logger';

export async function sendOpsAlertSms(title: string, lines: string[]): Promise<void> {
  const log = routeLogger('ops-sms', null);
  const to = process.env.OPS_ALERT_PHONE;
  if (!to) {
    // Fail loud: out-of-band escalation is unconfigured. Logged at ERROR so it
    // surfaces in Vercel logs rather than silently doing nothing.
    log.error({}, 'ops_alert.sms.no_destination — set OPS_ALERT_PHONE for out-of-band escalation');
    return;
  }
  const body = `FLOSTRUCTION ALERT: ${title}. ${lines[0] ?? ''}`.slice(0, 300);
  const client = getTwilioClient();
  const from = getTwilioFromNumber();
  try {
    await client.messages.create({ body, from, to, ...smsStatusCallbackOpts() });
  } catch (err) {
    await recordNotificationDeadLetter({
      channel: 'twilio_sms',
      recipient: to,
      summary: { kind: 'ops_alert', title },
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
