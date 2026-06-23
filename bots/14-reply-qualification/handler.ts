// Bot 14 — Reply qualification (FLOSMOSIS-calibrated).
//
// Trigger: inbound-reply webhook | Runtime: EF + pgmq | Gate: T2 reply | Model:
// Haiku/Sonnet (classify + draft). Deterministic SDR-grade first pass: detect
// buying signals (pricing, onboarding timeline, worker counts, procurement) and
// route hot. Unsubscribe/OOO take precedence. Replies are drafted, never
// auto-sent.

export const BOT_ID = 'bot-14-reply-qualification';

export type ReplyCategory =
  | 'interested'
  | 'not_interested'
  | 'out_of_office'
  | 'unsubscribe'
  | 'question'
  | 'other';

export type Route = 'sales' | 'suppress' | 'requeue' | 'support' | 'review';

export interface QualifiedReply {
  category: ReplyCategory;
  route: Route;
  priority: 'high' | 'normal' | 'low';
  /** A concrete buying signal was detected (price/timeline/scale/procurement). */
  buyingSignal: boolean;
  shouldDraft: boolean;
}

const UNSUB_RE = /\b(unsubscribe|remove me|opt out|stop emailing|take me off)\b/i;
const OOO_RE =
  /\b(out of (the )?office|on leave|annual leave|away until|on site until|maternity)\b/i;
const NOT_INTERESTED_RE =
  /\b(not interested|no thanks|we('| a)re good|already have|not a fit|using \w+ already)\b/i;
const INTERESTED_RE = /\b(interested|tell me more|sounds good|let'?s chat|keen|happy to|book a)\b/i;
// Buying signals specific to FLOSMOSIS's sale (price, onboarding, scale, procurement, compliance).
const BUYING_RE =
  /\b(how much|pricing|price|quote|cost|per worker|how many|workers|when can we (start|go live)|onboard|trial|pilot|contract|procurement|fair work|wage theft|payroll audit)\b/i;

/** Pure: SDR-grade classification + routing with buying-signal detection. */
export function qualifyReply(text: string): QualifiedReply {
  const buyingSignal = BUYING_RE.test(text);

  // Precedence: compliance/opt-out first.
  if (UNSUB_RE.test(text)) {
    return {
      category: 'unsubscribe',
      route: 'suppress',
      priority: 'high',
      buyingSignal: false,
      shouldDraft: false,
    };
  }
  if (OOO_RE.test(text)) {
    return {
      category: 'out_of_office',
      route: 'requeue',
      priority: 'low',
      buyingSignal,
      shouldDraft: false,
    };
  }
  if (NOT_INTERESTED_RE.test(text)) {
    return {
      category: 'not_interested',
      route: 'suppress',
      priority: 'low',
      buyingSignal: false,
      shouldDraft: false,
    };
  }
  if (INTERESTED_RE.test(text) || buyingSignal) {
    // A buying signal makes it a hot, sales-routed reply even without explicit "interested".
    return {
      category: 'interested',
      route: 'sales',
      priority: buyingSignal ? 'high' : 'normal',
      buyingSignal,
      shouldDraft: true,
    };
  }
  if (/\?/.test(text)) {
    return {
      category: 'question',
      route: 'support',
      priority: 'normal',
      buyingSignal,
      shouldDraft: true,
    };
  }
  return { category: 'other', route: 'review', priority: 'low', buyingSignal, shouldDraft: false };
}
