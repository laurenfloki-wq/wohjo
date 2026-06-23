// Golden evals — bot 40 (financial reporting), FLOSMOSIS-calibrated.

import { describe, it, expect } from 'vitest';
import { buildReport } from './handler';

describe('bot 40 — financial reporting (calibrated)', () => {
  it('computes margins, burn, runway and raises a runway alert', () => {
    const r = buildReport({
      revenueCents: 50_00,
      cogsCents: 10_00,
      opexCents: 90_00,
      cashBalanceCents: 200_00, // tiny cash vs burn -> short runway
    });
    expect(r.grossProfitCents).toBe(40_00);
    expect(r.grossMarginPct).toBe(80);
    expect(r.netProfitCents).toBe(-50_00);
    expect(r.monthlyBurnCents).toBe(50_00);
    expect(r.runwayMonths).toBeCloseTo(4, 6); // 200/50
    expect(r.alerts.some((a) => a.includes('Runway'))).toBe(true);
  });

  it('flags thin gross margin', () => {
    const r = buildReport({
      revenueCents: 100_00,
      cogsCents: 40_00,
      opexCents: 10_00,
      cashBalanceCents: 100000_00,
    });
    expect(r.grossMarginPct).toBe(60);
    expect(r.alerts.some((a) => a.includes('Gross margin'))).toBe(true);
  });

  it('reports null runway and no runway alert when profitable', () => {
    const r = buildReport({
      revenueCents: 100_00,
      cogsCents: 10_00,
      opexCents: 20_00,
      cashBalanceCents: 1000_00,
    });
    expect(r.netProfitCents).toBe(70_00);
    expect(r.runwayMonths).toBeNull();
    expect(r.alerts.some((a) => a.includes('Runway'))).toBe(false);
  });
});
