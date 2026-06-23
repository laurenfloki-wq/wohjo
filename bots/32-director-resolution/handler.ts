// Bot 32 — Director resolution.
//
// Trigger: decision (manual) | Runtime: EF (HTTP) | Gate: T3 | Model: Sonnet
// (draft minute). Sonnet drafts the minute; the register entry is validated
// deterministically (all required fields, both directors) before it is recorded.
// Director-signed; dual-control (T3).

export const BOT_ID = 'bot-32-director-resolution';

// The two directors (per the mission). Both are required to pass a resolution.
export const DIRECTORS = ['Lauren Kate de Mestre', 'João Muniz Campos'] as const;

export interface ResolutionInput {
  title: string;
  decision: string;
  date: string;
  approvedBy: ReadonlyArray<string>;
}

export interface RegisterEntry {
  title: string;
  decision: string;
  date: string;
  approvedBy: string[];
  valid: boolean;
  problems: string[];
}

/**
 * Pure: validate and build a register entry. A resolution is valid only when it
 * has a title, decision, date, and approval from BOTH directors (dual-control).
 */
export function buildRegisterEntry(input: ResolutionInput): RegisterEntry {
  const problems: string[] = [];
  if (!input.title.trim()) problems.push('missing title');
  if (!input.decision.trim()) problems.push('missing decision');
  if (!input.date.trim()) problems.push('missing date');
  const approved = new Set(input.approvedBy.map((a) => a.trim()));
  for (const d of DIRECTORS) {
    if (!approved.has(d)) problems.push(`missing approval from ${d}`);
  }
  return {
    title: input.title,
    decision: input.decision,
    date: input.date,
    approvedBy: [...approved],
    valid: problems.length === 0,
    problems,
  };
}
