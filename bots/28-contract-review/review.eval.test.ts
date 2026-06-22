// Golden evals — bot 28 (contract review). Deviation detection with fallback.
import { describe, it, expect } from 'vitest';
import { findDeviations, type PlaybookClause } from './handler';

const pb: PlaybookClause[] = [
  { name: 'liability_cap', standard: '12 months fees', fallback: '24 months fees' },
  { name: 'governing_law', standard: 'Victoria', fallback: 'NSW' },
];

describe('bot 28 — contract review', () => {
  it('no deviations when positions match standard', () => {
    expect(
      findDeviations(pb, [
        { name: 'liability_cap', position: '12 months fees' },
        { name: 'governing_law', position: 'Victoria' },
      ]),
    ).toEqual([]);
  });
  it('flags a differing position with its fallback', () => {
    const d = findDeviations(pb, [
      { name: 'liability_cap', position: 'unlimited' },
      { name: 'governing_law', position: 'Victoria' },
    ]);
    expect(d).toHaveLength(1);
    expect(d[0]?.theirs).toBe('unlimited');
    expect(d[0]?.fallback).toBe('24 months fees');
  });
  it('flags an absent clause as a deviation', () => {
    const d = findDeviations(pb, [{ name: 'governing_law', position: 'Victoria' }]);
    expect(d[0]?.clause).toBe('liability_cap');
    expect(d[0]?.theirs).toBeNull();
  });
});
