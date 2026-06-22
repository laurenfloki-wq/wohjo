// Bot 37 — Dunning.
//
// Trigger: failed-payment webhook | Runtime: EF + pgmq | Gate: T2 send |
// Model: Sonnet (recovery copy). The retry ladder is pure and deterministic;
// the Sonnet copy is drafted and then passed through the compliance guard
// (ABN + unsubscribe) before any send, which is gated T2. Idempotent per
// invoice + attempt.

import { DUNNING } from '../config';

export const BOT_ID = 'bot-37-dunning';

export interface DunningStep {
  attempt: number;
  /** Hours to wait before this attempt's outreach. */
  delayHours: number;
  channel: 'email' | 'email_and_sms';
  /** After the final step, hand off rather than keep retrying. */
  escalateToHuman: boolean;
}

/**
 * Pure: the step for a given attempt (1-based). The cadence is the configured
 * B2B AU ladder (bots/config.ts: gentle reminder -> firmer -> final notice with
 * the workforce SMS channel -> last call), then escalation to a human so we
 * never dun a customer relationship to death.
 */
export function dunningStep(attempt: number): DunningStep {
  const idx = attempt - 1;
  if (idx < 0) {
    return { attempt, delayHours: 0, channel: 'email', escalateToHuman: false };
  }
  if (idx >= DUNNING.ladder.length) {
    return { attempt, delayHours: 0, channel: 'email', escalateToHuman: true };
  }
  const step = DUNNING.ladder[idx]!;
  return { attempt, delayHours: step.delayHours, channel: step.channel, escalateToHuman: false };
}

/** Idempotency key for an invoice + attempt — prevents double-dunning on replay. */
export function dunningKey(invoiceId: string, attempt: number): string {
  return `dunning:${invoiceId}:${attempt}`;
}
