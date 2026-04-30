// Animation timing constants and shared easings for /get-started.
//
// Centralised here so the page, Receipt, and Timeline modules share a
// single timing vocabulary — and so the timing-curve choices are
// reviewable in one place.
//
// Easings are written as cubic-bezier 4-tuples for use with Framer
// Motion. Two curves used throughout:
//   EASE_OUT_EXPO  — luxurious "object rising into place" feel.
//                    Fast initial movement, gentle decel. Used for
//                    section reveals and the receipt card materialise.
//   EASE_OUT_QUART — same family, slightly less aggressive. Used
//                    for hover states + form focus animations.
//
// All durations in seconds (Framer Motion convention).

export const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];
export const EASE_OUT_QUART: [number, number, number, number] = [0.25, 1, 0.5, 1];
export const EASE_IN_OUT: [number, number, number, number] = [0.4, 0, 0.2, 1];

/** Duration tokens — keep in lockstep with brief's specified timings. */
export const D = {
  // Receipt build sequence
  cardMaterialise: 0.4,
  receiptHeader: 0.2,
  receiptIdSlide: 0.3,
  cascadeStagger: 0.15,
  cascadeStep: 0.25,
  hashBuild: 1.0,
  pulse: 0.6,
  finalLand: 0.25,

  // Section reveals
  sectionReveal: 0.6,
  staggerHeadlineLine: 0.12,
  staggerCard: 0.10,
  staggerTrust: 0.08,
  staggerTimelineStep: 0.25,

  // Form interactions
  fieldFocusTransition: 0.25,
  buttonCompress: 0.1,
  buttonAmberDeep: 0.2,
  hashSweep: 0.6,
  sealStamp: 0.7,

  // Hover states
  hover: 0.2,

  // Continuous breathing (post-build)
  breathe: 4.0,

  // Page mount transition
  pageMount: 0.6,
} as const;

/** Receipt build-sequence absolute time offsets, seconds from animation start.
 *  Total budget ~4.0s per brief. */
export const RECEIPT_TIMING = {
  card: 0.0,
  header: 0.30,
  receiptId: 0.50,
  divider1: 0.80,
  workerLine: 0.90,
  siteLine: 1.05,
  dateLine: 1.20,
  divider2: 1.40,
  clockIn: 1.55,
  confirmed: 1.70,
  clockOut: 1.85,
  hours: 2.00,
  approved: 2.15,
  divider3: 2.40,
  hashStart: 2.60,
  hashEnd: 3.60,
  intactPulse: 3.60,
  wlesVerified: 3.95,
} as const;

/**
 * Generate accelerating-reveal timing for N characters over `total` seconds.
 * Used by the hash-build animation: chars appear with progressively shorter
 * intervals — feels like the hash is "settling into place".
 *
 * Easing: cubic ease-in (t^3) over the timing space, so first chars are
 * slower and later chars compress.
 */
export function acceleratingCharDelays(count: number, total: number): number[] {
  const delays: number[] = [];
  for (let i = 0; i < count; i++) {
    // u in [0, 1] for the i-th char
    const u = count <= 1 ? 0 : i / (count - 1);
    // ease-in cubic: more time at start, less at end
    const t = Math.pow(u, 0.6); // less aggressive than ^3 — perceptually balanced
    delays.push(t * total);
  }
  return delays;
}
