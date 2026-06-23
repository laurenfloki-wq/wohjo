// Golden evals — bot 38 (BAS/GST prep). Deterministic figures.

import { describe, it, expect } from 'vitest';
import { assembleBas } from './handler';

describe('bot 38 — BAS/GST prep', () => {
  it('computes G1, 1A, 1B and net GST', () => {
    const bas = assembleBas([
      { grossCents: 11000, taxable: true }, // sale $110 inc -> $10 GST
      { grossCents: 5500, taxable: true }, // sale $55 inc -> $5 GST
      { grossCents: -2200, taxable: true }, // purchase $22 inc -> $2 GST credit
    ]);
    expect(bas.G1_totalSalesCents).toBe(16500);
    expect(bas.c1A_gstOnSalesCents).toBe(1500);
    expect(bas.c1B_gstOnPurchasesCents).toBe(200);
    expect(bas.c7_netGstCents).toBe(1300);
  });

  it('excludes GST-free supplies from 1A', () => {
    const bas = assembleBas([{ grossCents: 10000, taxable: false }]);
    expect(bas.G1_totalSalesCents).toBe(10000);
    expect(bas.c1A_gstOnSalesCents).toBe(0);
  });
});
