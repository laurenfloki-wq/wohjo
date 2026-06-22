// Bot 27 — Contract drafting.
//
// Trigger: manual | Runtime: EF (HTTP) | Gate: T3 execution | Model: Sonnet
// (tailor). Drafts ONLY from canonical templates; Sonnet tailors within the
// template; any clause not in the canonical set is flagged as non-standard.
// Execution is dual-control (T3). Template selection + non-standard detection
// are deterministic.

export const BOT_ID = 'bot-27-contract-drafting';

export type ContractType = 'msa' | 'order_form' | 'nda' | 'dpa';

export const CANONICAL_CLAUSES: Record<ContractType, ReadonlyArray<string>> = {
  msa: ['parties', 'services', 'fees', 'term', 'liability', 'termination', 'governing_law'],
  order_form: ['parties', 'plan', 'active_workers', 'fees', 'term'],
  nda: ['parties', 'confidential_info', 'term', 'governing_law'],
  dpa: ['parties', 'processing', 'subprocessors', 'security', 'breach_notice'],
};

export interface DraftReview {
  type: ContractType;
  missingClauses: string[];
  nonStandardClauses: string[];
  requiresEscalation: boolean;
}

/**
 * Pure: compare the drafted clause set against the canonical template. Missing
 * canonical clauses and any non-standard (extra) clauses are flagged; either
 * forces escalation before the T3 execution gate.
 */
export function reviewDraft(
  type: ContractType,
  draftedClauses: ReadonlyArray<string>,
): DraftReview {
  const canonical = new Set(CANONICAL_CLAUSES[type]);
  const drafted = new Set(draftedClauses);
  const missingClauses = [...canonical].filter((c) => !drafted.has(c));
  const nonStandardClauses = [...drafted].filter((c) => !canonical.has(c));
  return {
    type,
    missingClauses,
    nonStandardClauses,
    requiresEscalation: missingClauses.length > 0 || nonStandardClauses.length > 0,
  };
}
