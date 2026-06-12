// Gated copy for the operator surface (dispatch 2026-06-12, rail 2:
// "JOAO'S WORDS"). The first-morning founders note and the trinity
// wording ship only after Joao's explicit yes — the mechanism exists
// now; the copy is held behind this flag. Flip ONLY on founder
// instruction recorded in the decision log.
export const JOAO_COPY_APPROVED = false;

/** Page footer brand line. The full trinity line is gated. */
export function brandLine(): string {
  return JOAO_COPY_APPROVED ? 'FLOSTRUCTION · a FLOSMOSIS product · WLES v1.0' : 'FLOSTRUCTION';
}
