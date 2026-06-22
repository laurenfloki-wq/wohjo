// Bot 28 — Contract review/redline.
//
// Trigger: inbound contract | Runtime: EF + pgmq | Gate: T3 accept | Model:
// Sonnet (compare to standard). Every deviation from the playbook is flagged
// with a fallback position. The deviation detection is deterministic over a
// structured clause comparison; Sonnet writes the redline prose.

export const BOT_ID = 'bot-28-contract-review';

export interface PlaybookClause {
  name: string;
  /** Acceptable standard position. */
  standard: string;
  /** Fallback if the counterparty pushes back. */
  fallback: string;
}

export interface IncomingClause {
  name: string;
  position: string;
}

export interface Deviation {
  clause: string;
  theirs: string | null; // null = clause absent
  standard: string;
  fallback: string;
}

/**
 * Pure: flag every playbook clause whose incoming position differs from the
 * standard (or is absent), carrying the fallback so the redline is actionable.
 */
export function findDeviations(
  playbook: ReadonlyArray<PlaybookClause>,
  incoming: ReadonlyArray<IncomingClause>,
): Deviation[] {
  const byName = new Map(incoming.map((c) => [c.name, c.position]));
  const deviations: Deviation[] = [];
  for (const pb of playbook) {
    const theirs = byName.has(pb.name) ? byName.get(pb.name)! : null;
    if (theirs !== pb.standard) {
      deviations.push({ clause: pb.name, theirs, standard: pb.standard, fallback: pb.fallback });
    }
  }
  return deviations;
}
