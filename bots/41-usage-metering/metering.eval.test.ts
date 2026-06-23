// Golden evals — bot 41 (usage-metering integrity), FLOSMOSIS-calibrated.

import { describe, it, expect } from 'vitest';
import { findMismatches, totalLeakageCents } from './handler';

describe('bot 41 — usage-metering integrity (calibrated)', () => {
  it('ties out cleanly with no flags', () => {
    expect(
      findMismatches([{ tenantId: 't1', meteredActiveWorkers: 10, billedActiveWorkers: 10 }]),
    ).toEqual([]);
  });

  it('classifies under- vs over-billing and sizes the impact', () => {
    const flags = findMismatches([
      { tenantId: 'leak', meteredActiveWorkers: 60, billedActiveWorkers: 50, perWorkerCents: 400 },
      {
        tenantId: 'overcharge',
        meteredActiveWorkers: 8,
        billedActiveWorkers: 12,
        perWorkerCents: 500,
      },
    ]);
    const byId = Object.fromEntries(flags.map((f) => [f.tenantId, f]));
    expect(byId.leak?.direction).toBe('under_billed');
    expect(byId.leak?.revenueImpactCents).toBe(10 * 400);
    expect(byId.overcharge?.direction).toBe('over_billed');
    expect(byId.overcharge?.revenueImpactCents).toBe(4 * 500);
  });

  it('surfaces the largest cash exposure first', () => {
    const flags = findMismatches([
      { tenantId: 'small', meteredActiveWorkers: 11, billedActiveWorkers: 10, perWorkerCents: 400 },
      { tenantId: 'big', meteredActiveWorkers: 70, billedActiveWorkers: 50, perWorkerCents: 400 },
    ]);
    expect(flags[0]?.tenantId).toBe('big');
  });

  it('totals only the revenue that is leaking (under-billed)', () => {
    const flags = findMismatches([
      { tenantId: 'leak', meteredActiveWorkers: 60, billedActiveWorkers: 50, perWorkerCents: 400 },
      {
        tenantId: 'overcharge',
        meteredActiveWorkers: 8,
        billedActiveWorkers: 12,
        perWorkerCents: 500,
      },
    ]);
    expect(totalLeakageCents(flags)).toBe(10 * 400);
  });
});
