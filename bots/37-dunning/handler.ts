// Bot 37 — Dunning.
//
// Trigger: failed-payment webhook | Runtime: EF + pgmq | Gate: T2 send |
// Model: Sonnet (recovery copy). The retry ladder is pure and deterministic;
// the Sonnet copy is drafted and then passed through the compliance guard
// (ABN + unsubscribe) before any send, which is gated T2. Idempotent per
// invoice + attempt.

export const BOT_ID = 'bot-37-dunning';

export interface DunningStep {
  attempt: number;
  /** Hours to wait before this attempt's outreach. */
  delayHours: number;
  channel: 'email' | 'email_and_sms';
  /** After the final step, hand off rather than keep retrying. */
  escalateToHuman: boolean;
}

// Retry ladder: gentle reminder, firmer follow-up, final notice, then handoff.
const LADDER: ReadonlyArray<Omit<DunningStep, 'attempt'>> = [
  { delayHours: 24, channel: 'email', escalateToHuman: false },
  { delayHours: 72, channel: 'email', escalateToHuman: false },
  { delayHours: 168, channel: 'email_and_sms', escalateToHuman: false },
];

/**
 * Pure: the step for a given attempt (1-based). Beyond the ladder, returns an
 * escalation step so we never dun indefinitely.
 */
export function dunningStep(attempt: number): DunningStep {
  const idx = attempt - 1;
  if (idx < 0) {
    return { attempt, delayHours: 0, channel: 'email', escalateToHuman: false };
  }
  if (idx >= LADDER.length) {
    return { attempt, delayHours: 0, channel: 'email', escalateToHuman: true };
  }
  return { attempt, ...LADDER[idx]! };
}

/** Idempotency key for an invoice + attempt — prevents double-dunning on replay. */
export function dunningKey(invoiceId: string, attempt: number): string {
  return `dunning:${invoiceId}:${attempt}`;
}
