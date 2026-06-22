// Golden evals — bot 41 (usage-metering integrity). Deterministic mismatch flags.

import { describe, it, expect } from 'vitest';
import { findMismatches } from './handler';

describe('bot 41 — usage-metering integrity', () => {
  it('returns no flags when billing ties out exactly', () => {
    expect(
      findMismatches([
        { tenantId: 't1', meteredActiveWorkers: 10, billedActiveWorkers: 10 },
        { tenantId: 't2', meteredActiveWorkers: 5, billedActiveWorkers: 5 },
      ]),
    ).toEqual([]);
  });

  it('flags divergence, largest absolute delta first', () => {
    const flags = findMismatches([
      { tenantId: 't1', meteredActiveWorkers: 10, billedActiveWorkers: 9 },
      { tenantId: 't2', meteredActiveWorkers: 5, billedActiveWorkers: 12 },
    ]);
    expect(flags).toHaveLength(2);
    expect(flags[0]?.tenantId).toBe('t2'); // |−7| > |+1|
    expect(flags[0]?.delta).toBe(-7);
    expect(flags[1]?.delta).toBe(1);
  });
});
