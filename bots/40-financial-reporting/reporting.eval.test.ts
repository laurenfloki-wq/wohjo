// Golden evals — bot 40 (financial reporting). Deterministic figures + runway.

import { describe, it, expect } from 'vitest';
import { buildReport } from './handler';

describe('bot 40 — financial reporting', () => {
  it('computes gross/net profit and runway when burning', () => {
    const r = buildReport({
      revenueCents: 50_00,
      cogsCents: 10_00,
      opexCents: 90_00,
      cashBalanceCents: 5000_00,
    });
    expect(r.grossProfitCents).toBe(40_00);
    expect(r.netProfitCents).toBe(-50_00); // burning $50/mo
    expect(r.monthlyBurnCents).toBe(50_00);
    expect(r.runwayMonths).toBeCloseTo(100, 6); // 5000 / 50
  });

  it('reports null runway when profitable (no burn)', () => {
    const r = buildReport({
      revenueCents: 100_00,
      cogsCents: 10_00,
      opexCents: 20_00,
      cashBalanceCents: 1000_00,
    });
    expect(r.netProfitCents).toBe(70_00);
    expect(r.monthlyBurnCents).toBe(0);
    expect(r.runwayMonths).toBeNull();
  });
});
