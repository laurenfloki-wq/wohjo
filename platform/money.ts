// money.ts — deterministic money helpers. Integer cents only; never floats for
// amounts. Australian GST is 10%, GST-inclusive on domestic supplies.
//
// Shared by the finance bots (34, 35, 36, 38, 41) so GST is computed one way.

/** GST component of a GST-inclusive amount (cents). round-half-up. */
export function gstFromInclusiveCents(grossCents: number): number {
  // GST = gross * 1/11 for a 10% GST-inclusive amount.
  return Math.round(grossCents / 11);
}

/** Net (ex-GST) component of a GST-inclusive amount (cents). */
export function netFromInclusiveCents(grossCents: number): number {
  return grossCents - gstFromInclusiveCents(grossCents);
}

/** Format cents as AUD string for human-facing artefacts (no currency symbol drift). */
export function formatAud(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
