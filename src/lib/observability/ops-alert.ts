// Phase 3 / OBS-2/3 — ops-alert fan-out (node-only).
//
// The original incident: every alert depended on a single channel, so when that
// channel was down nobody heard the alarm for days. This dispatches each RED
// alert across EVERY channel we actually have, INDEPENDENTLY (Promise.allSettled
// isolates them), so one provider being down can never silence the others:
//   - Slack webhook  — legacy/optional; no-op without SLACK_ERROR_WEBHOOK_URL
//   - Email (Resend) — rich; to ALERT_EMAIL_TO / admin@flosmosis.com (always on)
//   - SMS (Twilio)   — terse; OUT-OF-BAND, independent of Resend — only when
//                      sms:true, reserved for genuinely critical RED
//
// Node-only (Twilio SDK is not edge-safe): import this ONLY from cron routes,
// never from edge instrumentation. The edge error path stays on slack.ts.

import { postOpsAlert } from './slack';
import { sendOpsAlertEmail } from '@/lib/email/notify';
import { sendOpsAlertSms } from '@/lib/sms/ops-sms';
import { checkRateLimitDurable } from '@/lib/security/rate-limit-durable';
import { routeLogger } from '@/lib/logger';

// OBS-6 — cross-instance de-dupe window. The in-memory throttle only de-dups
// per serverless instance, so a fleet could fan the same alert out N times.
const OPS_ALERT_DEDUPE_MS = 10 * 60 * 1000;

export interface OpsAlertOptions {
  /** Also fire the out-of-band SMS. Reserve for critical/integrity RED. */
  sms?: boolean;
}

export async function dispatchOpsAlert(
  title: string,
  lines: string[],
  opts: OpsAlertOptions = {},
): Promise<void> {
  const log = routeLogger('ops-alert', null);

  // OBS-6 — at most one identical ops alert per window across the WHOLE fleet
  // (durable, cross-instance). Fail-OPEN: never suppress an alert because the
  // de-dupe check itself errored — a missed dedupe is far cheaper than a missed
  // alarm. Records (alert rows + health log) are written by callers regardless.
  try {
    const dedupe = await checkRateLimitDurable(`ops_alert:${title}`, {
      windowMs: OPS_ALERT_DEDUPE_MS,
      maxRequests: 1,
    });
    if (!dedupe.allowed) {
      log.warn({ title }, 'ops_alert.deduped_cross_instance');
      return;
    }
  } catch {
    /* fail-open — fire the alert */
  }
  const channels: Array<[string, Promise<void>]> = [
    ['slack', postOpsAlert(title, lines)],
    ['email', sendOpsAlertEmail(title, lines)],
  ];
  if (opts.sms) channels.push(['sms', sendOpsAlertSms(title, lines)]);

  const results = await Promise.allSettled(channels.map(([, p]) => p));
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      log.error(
        { channel: channels[i][0], err: r.reason instanceof Error ? r.reason.message : String(r.reason) },
        'ops_alert.channel_failed',
      );
    }
  });
}
