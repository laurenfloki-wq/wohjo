// Bot 5 — Social engagement.
//
// Trigger: poll/webhook | Runtime: EF + pgmq | Gate: T2 reply | Model:
// Haiku/Sonnet (classify + draft). Replies are drafted, never auto-sent. The
// triage (which comments warrant a drafted reply, and the routing intent) is a
// deterministic first pass; the LLM only refines and drafts.

export const BOT_ID = 'bot-5-social-engagement';

export type EngagementIntent = 'question' | 'complaint' | 'praise' | 'spam' | 'other';

export interface IncomingComment {
  id: string;
  text: string;
  authorFollowers: number;
}

export interface TriagedComment {
  id: string;
  intent: EngagementIntent;
  /** Whether to draft a reply (never auto-send — reply is T2). */
  shouldDraft: boolean;
}

const SPAM_RE = /\b(crypto|giveaway|free money|click here|t\.me\/)\b/i;
const QUESTION_RE = /\?|\bhow\b|\bwhat\b|\bwhen\b|\bdoes\b|\bcan you\b/i;
const COMPLAINT_RE = /\b(broken|terrible|scam|refund|not working|disappointed)\b/i;
const PRAISE_RE = /\b(love|great|excellent|amazing|thank you|brilliant)\b/i;

/** Pure: classify a comment's intent deterministically. */
export function classifyIntent(text: string): EngagementIntent {
  if (SPAM_RE.test(text)) return 'spam';
  if (COMPLAINT_RE.test(text)) return 'complaint';
  if (QUESTION_RE.test(text)) return 'question';
  if (PRAISE_RE.test(text)) return 'praise';
  return 'other';
}

/**
 * Pure: triage. Draft replies for questions and complaints (engagement that
 * needs a response); never draft for spam. Praise/other are optional and left
 * undrafted to keep cost and human surface low.
 */
export function triageComment(c: IncomingComment): TriagedComment {
  const intent = classifyIntent(c.text);
  const shouldDraft = intent === 'question' || intent === 'complaint';
  return { id: c.id, intent, shouldDraft };
}
