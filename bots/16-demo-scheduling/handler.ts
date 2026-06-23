// Bot 16 — Demo scheduling.
//
// Trigger: request/webhook | Runtime: EF | Gate: T1 | Model: none.
//
// Offers slots, books, reminds, prep brief. The booking guard (no double-book)
// is pure and deterministic; the Google Calendar / Gmail calls are connectors.

export const BOT_ID = 'bot-16-demo-scheduling';

export interface Interval {
  startMs: number;
  endMs: number;
}

/** True if two intervals overlap (touching edges do not count as overlap). */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

/**
 * Pure: can `candidate` be booked given existing bookings? Returns false if it
 * overlaps any existing booking (no double-book) or is zero/negative length.
 */
export function canBook(candidate: Interval, existing: ReadonlyArray<Interval>): boolean {
  if (candidate.endMs <= candidate.startMs) return false;
  return !existing.some((e) => overlaps(candidate, e));
}

/** Offer the first N free slots from a list of candidates, given existing bookings. */
export function offerSlots(
  candidates: ReadonlyArray<Interval>,
  existing: ReadonlyArray<Interval>,
  n: number,
): Interval[] {
  const free: Interval[] = [];
  for (const c of candidates) {
    if (canBook(c, existing)) free.push(c);
    if (free.length >= n) break;
  }
  return free;
}
