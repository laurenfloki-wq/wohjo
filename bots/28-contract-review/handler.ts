// Bot 28 — Contract review/redline.
//
// Trigger: inbound contract | Runtime: EF + pgmq | Gate: T3 accept | Model:
// Sonnet (compare to standard). Every deviation from the playbook is flagged
// with a fallback position. The deviation detection is deterministic over a
// structured clause comparison; Sonnet writes the redline prose. Deviations on
// critical clauses (liability, indemnity, data/privacy, IP, termination) are
// flagged as high severity so the redline leads with what can actually hurt.

import { CONTRACT } from '../config';

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
  severity: 'critical' | 'standard';
}

function isCritical(clause: string): boolean {
  const c = clause.toLowerCase();
  return CONTRACT.criticalClauses.some((k) => c.includes(k));
}

/**
 * Pure: flag every playbook clause whose incoming position differs from the
 * standard (or is absent), carrying the fallback so the redline is actionable.
 * Critical-clause deviations (liability, indemnity, data/privacy, IP,
 * termination) are surfaced first — they are the ones that can actually hurt.
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
      deviations.push({
        clause: pb.name,
        theirs,
        standard: pb.standard,
        fallback: pb.fallback,
        severity: isCritical(pb.name) ? 'critical' : 'standard',
      });
    }
  }
  // Critical deviations first.
  return deviations.sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1,
  );
}
