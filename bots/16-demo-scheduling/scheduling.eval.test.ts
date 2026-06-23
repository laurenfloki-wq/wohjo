// Golden evals — bot 16 (demo scheduling). No double-book.

import { describe, it, expect } from 'vitest';
import { canBook, offerSlots, overlaps } from './handler';

const slot = (s: number, e: number) => ({ startMs: s, endMs: e });

describe('bot 16 — demo scheduling', () => {
  it('detects overlap but allows touching edges', () => {
    expect(overlaps(slot(0, 10), slot(5, 15))).toBe(true);
    expect(overlaps(slot(0, 10), slot(10, 20))).toBe(false);
  });

  it('refuses a double-book and zero-length slots', () => {
    expect(canBook(slot(0, 10), [slot(5, 15)])).toBe(false);
    expect(canBook(slot(10, 20), [slot(0, 10)])).toBe(true);
    expect(canBook(slot(5, 5), [])).toBe(false);
  });

  it('offers the first N free slots', () => {
    const candidates = [slot(0, 10), slot(10, 20), slot(20, 30)];
    const existing = [slot(5, 15)]; // blocks slot 0-10 and 10-20
    expect(offerSlots(candidates, existing, 2)).toEqual([slot(20, 30)]);
  });
});
