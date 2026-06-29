// Gated-report content helpers (S4 / P5). The FREE on-screen result keeps the
// diagnosis + the rule + ONE next step per gap (JOLT). The GATED report adds
// depth — including the prioritised plan ACROSS all gaps. `orderedGaps` derives
// that ordering from the already-computed result (real, not invented): flagged
// gaps, worst exposure first. Shared by the PDF and the email so they agree.

import type { VectorResult } from './types';

/** Flagged (applicable, watch/exposed) gaps, highest exposure first. */
export function orderedGaps(result: { vectors: VectorResult[] }): VectorResult[] {
  return result.vectors
    .filter((v) => v.applicable && (v.band === 'watch' || v.band === 'exposed'))
    .sort((a, b) => b.score - a.score);
}
