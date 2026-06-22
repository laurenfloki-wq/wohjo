// Bot 23 — 24/7 client support (FLOSMOSIS-calibrated, WLES-grounded).
//
// Trigger: chat/email/webhook | Runtime: EF (HTTP) | Gate: T0 grounded, T2
// billing/legal | Model: Sonnet (Haiku route). The bespoke rule for this product:
// an account-specific pay/record question must be answered ONLY from a verified
// sealed record (route to bot 26), never from KB recall — that is the entire WLES
// value proposition. General product questions are answered from the KB when
// retrieval is confident; medium confidence asks one clarifying question; weak
// confidence or billing/legal escalates to a director. Thresholds in config.

import { assertGrounded } from '../../platform/guard';
import { SUPPORT } from '../config';

export const BOT_ID = 'bot-23-client-support';

export interface RetrievedSource {
  id: string;
  score: number; // similarity 0-1
}

export type SupportAction =
  | { kind: 'answer'; tier: 'T0' }
  | { kind: 'clarify'; tier: 'T0'; reason: string }
  | { kind: 'evidence'; tier: 'T0'; reason: string } // route to sealed-record path (bot 26)
  | { kind: 'escalate'; tier: 'T2'; reason: string };

const SENSITIVE_RE = /\b(billing|invoice|refund|charge|legal|dispute|contract|liability|cancel)\b/i;
// Account-specific pay/record questions — must be answered from sealed records.
const PAY_RECORD_RE =
  /\b(my (hours|pay|timesheet|shift|record)|how many hours|did i (clock|get paid)|was i paid|underpaid|my payslip|my receipt|hours (i|we) worked)\b/i;

/**
 * Pure: route a support query.
 *  - billing/legal/cancel -> escalate (T2 director).
 *  - account-specific pay/record -> evidence (sealed-record path; never KB recall).
 *  - general + strong retrieval -> answer (T0 grounded).
 *  - general + medium retrieval -> clarify (one question, T0).
 *  - general + weak retrieval -> escalate (don't guess).
 */
export function decideSupportAction(
  query: string,
  sources: ReadonlyArray<RetrievedSource>,
): SupportAction {
  if (SENSITIVE_RE.test(query)) {
    return { kind: 'escalate', tier: 'T2', reason: 'billing/legal topic requires a director' };
  }
  // A pay/record question is answered from sealed records, not the KB — even if
  // the KB has a confident-looking match (which would be unsourced recall).
  if (PAY_RECORD_RE.test(query)) {
    return {
      kind: 'evidence',
      tier: 'T0',
      reason: 'account-specific pay/record — answer from the sealed record only',
    };
  }
  const best = sources.reduce((m, s) => Math.max(m, s.score), 0);
  if (sources.length > 0 && best >= SUPPORT.minGroundingConfidence) {
    return { kind: 'answer', tier: 'T0' };
  }
  if (best >= SUPPORT.clarifyConfidence) {
    return {
      kind: 'clarify',
      tier: 'T0',
      reason: 'partial match — ask one clarifying question before answering',
    };
  }
  return { kind: 'escalate', tier: 'T2', reason: 'insufficient grounding to answer safely' };
}

/** Guard a drafted KB answer: it must cite only retrieved sources. */
export function guardAnswer(
  sources: ReadonlyArray<RetrievedSource>,
  citedIds: ReadonlyArray<string>,
): void {
  assertGrounded({ sources: sources.map((s) => ({ id: s.id })), citedIds });
}
