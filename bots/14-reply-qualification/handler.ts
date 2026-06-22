// Bot 14 — Reply qualification.
//
// Trigger: inbound-reply webhook | Runtime: EF + pgmq | Gate: T2 reply |
// Model: Haiku/Sonnet (classify + draft). The first-pass classification and
// routing are deterministic; the LLM refines and drafts. Replies are drafted
// only, never auto-sent.

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
  /** Whether to draft a reply (never auto-send — T2). */
  shouldDraft: boolean;
}

const UNSUB_RE = /\b(unsubscribe|remove me|opt out|stop emailing)\b/i;
const OOO_RE = /\b(out of (the )?office|on leave|annual leave|away until|maternity)\b/i;
const NOT_INTERESTED_RE = /\b(not interested|no thanks|we('| a)re good|already have|not a fit)\b/i;
const INTERESTED_RE = /\b(interested|tell me more|sounds good|book a|let'?s chat|keen)\b/i;

/** Pure: deterministic reply classification + routing. */
export function qualifyReply(text: string): QualifiedReply {
  // Order matters: unsubscribe and OOO take precedence over interest signals.
  if (UNSUB_RE.test(text))
    return { category: 'unsubscribe', route: 'suppress', shouldDraft: false };
  if (OOO_RE.test(text)) return { category: 'out_of_office', route: 'requeue', shouldDraft: false };
  if (NOT_INTERESTED_RE.test(text))
    return { category: 'not_interested', route: 'suppress', shouldDraft: false };
  if (INTERESTED_RE.test(text))
    return { category: 'interested', route: 'sales', shouldDraft: true };
  if (/\?/.test(text)) return { category: 'question', route: 'support', shouldDraft: true };
  return { category: 'other', route: 'review', shouldDraft: false };
}
