// Bot 23 — 24/7 client support.
//
// Trigger: chat/email/webhook | Runtime: EF (HTTP) | Gate: T0 grounded, T2
// billing/legal | Model: Sonnet (Haiku route). Retrieve from the pgvector KB,
// answer in voice, assertGrounded, escalate if unsure. The routing/escalation
// decision is deterministic; the answer is grounded (never free recall).

import { assertGrounded } from '../../platform/guard';

export const BOT_ID = 'bot-23-client-support';

export interface RetrievedSource {
  id: string;
  score: number; // similarity 0-1
}

export type SupportAction =
  | { kind: 'answer'; tier: 'T0' }
  | { kind: 'escalate'; tier: 'T2'; reason: string };

const SENSITIVE_RE = /\b(billing|invoice|refund|charge|legal|dispute|contract|liability)\b/i;
const MIN_CONFIDENCE = 0.7;

/**
 * Pure: decide whether to answer (grounded, T0) or escalate to a director (T2).
 * Escalate when the topic is billing/legal, or when retrieval is too weak to
 * ground an answer. Otherwise answer at T0.
 */
export function decideSupportAction(
  query: string,
  sources: ReadonlyArray<RetrievedSource>,
): SupportAction {
  if (SENSITIVE_RE.test(query)) {
    return { kind: 'escalate', tier: 'T2', reason: 'billing/legal topic requires a director' };
  }
  const best = sources.reduce((m, s) => Math.max(m, s.score), 0);
  if (sources.length === 0 || best < MIN_CONFIDENCE) {
    return { kind: 'escalate', tier: 'T2', reason: 'insufficient grounding to answer safely' };
  }
  return { kind: 'answer', tier: 'T0' };
}

/**
 * Guard the drafted answer: it must cite only retrieved sources. Throws via
 * assertGrounded on any uncited or hallucinated source. Returns nothing on pass.
 */
export function guardAnswer(
  sources: ReadonlyArray<RetrievedSource>,
  citedIds: ReadonlyArray<string>,
): void {
  assertGrounded({ sources: sources.map((s) => ({ id: s.id })), citedIds });
}
