// B4 / SG-5 (2026-06-12) — outbound notification dead letters.
//
// Inbound deliveries (Twilio webhook, Stripe webhook) already carry
// Stripe-bar dead-letter semantics (W4/W5). Outbound was the gap:
// worker SMS and Resend emails were fire-and-forget — a provider
// outage silently dropped the human-facing observable with no durable
// record. This module records every failed outbound send into
// notification_dead_letter (insert-only; RLS enabled; service-role
// surface) so an outage is visible (substrate-health check
// 'notification_outbound') and individually re-triggerable.
//
// Replay is operator-led: rows reference the triggering context, not a
// stored message body (bodies are regenerable from substrate state;
// MFA codes must never be persisted). Automated retry/backoff cron:
// parking lot — Dispatch 2 B4 note; not in spec for this pass.

import { getServiceClientForSystemJob } from '@/lib/db/service-client';
import { routeLogger } from '@/lib/logger';

export type NotificationChannel = 'twilio_sms' | 'resend_email';

export interface NotificationDeadLetterInput {
  channel: NotificationChannel;
  recipient: string;
  /** What was being sent — kind/subject only; never bodies or codes. */
  summary: Record<string, unknown>;
  error: string;
  /** Triggering context (shift_id, receipt_id, ...) for operator replay. */
  context?: Record<string, unknown>;
}

/**
 * Record a failed outbound notification. NEVER throws — recording is
 * best-effort and must not alter the caller's own error propagation;
 * a recording failure is itself logged at ERROR.
 */
export async function recordNotificationDeadLetter(
  input: NotificationDeadLetterInput,
): Promise<void> {
  const log = routeLogger('lib/notify/dead-letter', null);
  try {
    const supabase = getServiceClientForSystemJob();
    const { error } = await supabase.from('notification_dead_letter').insert({
      channel: input.channel,
      recipient: input.recipient,
      summary: input.summary,
      error: input.error,
      context: input.context ?? null,
    });
    if (error) {
      log.error(
        { err: error.message, channel: input.channel },
        'notify.dead_letter.record_failed',
      );
    } else {
      log.error(
        { channel: input.channel, summary: input.summary },
        'notify.dead_letter.recorded',
      );
    }
  } catch (e) {
    log.error(
      { err: e instanceof Error ? e.message : String(e), channel: input.channel },
      'notify.dead_letter.record_failed',
    );
  }
}
