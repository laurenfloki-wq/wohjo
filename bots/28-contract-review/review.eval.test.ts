// Golden evals — bot 28 (contract review), FLOSMOSIS-calibrated.

import { describe, it, expect } from 'vitest';
import { findDeviations, type PlaybookClause } from './handler';

const pb: PlaybookClause[] = [
  { name: 'liability_cap', standard: '12 months fees', fallback: '24 months fees' },
  { name: 'governing_law', standard: 'Victoria', fallback: 'NSW' },
  { name: 'data_privacy', standard: 'APP-compliant', fallback: 'negotiate' },
];

describe('bot 28 — contract review (calibrated)', () => {
  it('no deviations when positions match', () => {
    expect(
      findDeviations(pb, [
        { name: 'liability_cap', position: '12 months fees' },
        { name: 'governing_law', position: 'Victoria' },
        { name: 'data_privacy', position: 'APP-compliant' },
      ]),
    ).toEqual([]);
  });

  it('marks critical-clause deviations and surfaces them first', () => {
    const d = findDeviations(pb, [
      { name: 'governing_law', position: 'Queensland' }, // standard clause deviation
      { name: 'liability_cap', position: 'unlimited' }, // critical
      { name: 'data_privacy', position: 'none' }, // critical
    ]);
    expect(d[0]?.severity).toBe('critical');
    expect(d.filter((x) => x.severity === 'critical').map((x) => x.clause)).toEqual(
      expect.arrayContaining(['liability_cap', 'data_privacy']),
    );
    expect(d[d.length - 1]?.clause).toBe('governing_law'); // standard last
  });

  it('flags an absent critical clause', () => {
    const d = findDeviations(pb, [
      { name: 'liability_cap', position: '12 months fees' },
      { name: 'governing_law', position: 'Victoria' },
    ]);
    expect(d[0]?.clause).toBe('data_privacy');
    expect(d[0]?.theirs).toBeNull();
    expect(d[0]?.severity).toBe('critical');
  });
});
