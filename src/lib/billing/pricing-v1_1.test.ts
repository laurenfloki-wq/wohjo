import { describe, it, expect } from 'vitest';
import {
  TIERS_V1_1,
  computeMonthlyBillCents,
  monthlyBillDollars,
  resolveTierByWorkers,
} from './pricing-v1_1';

// Pinned to Pricing Spec v1.1's worked monthly bills (ex-GST) — the engine must
// reproduce the spec table exactly. Decisions A–E locked 2026-06-23.

describe('v1.1 bill engine — reproduces the spec worked table (ex-GST dollars)', () => {
  const cases: Array<[Parameters<typeof monthlyBillDollars>[0], number, number]> = [
    ['starter', 1, 99],
    ['starter', 10, 99],
    ['starter', 25, 174], // ceiling
    ['growth', 26, 299],
    ['growth', 75, 439],
    ['growth', 120, 619], // ceiling
    ['enterprise', 121, 1393], // 1393.25 → 1393
    ['enterprise', 220, 1715],
    ['enterprise', 400, 2300],
    ['enterprise', 600, 2900],
  ];
  for (const [tier, workers, expected] of cases) {
    it(`${tier} @ ${workers} workers = $${expected}`, () => {
      expect(monthlyBillDollars(tier, workers)).toBe(expected);
    });
  }
});

describe('v1.1 bill engine — structure', () => {
  it('Starter base is $99 incl. 10, $5/worker to ceiling 25 (Decision B)', () => {
    expect(TIERS_V1_1.starter.baseCents).toBe(9_900);
    expect(TIERS_V1_1.starter.includedWorkers).toBe(10);
    expect(TIERS_V1_1.starter.ceiling).toBe(25);
    expect(computeMonthlyBillCents('starter', 11)).toBe(9_900 + 500); // +1 worker = +$5
  });

  it('Growth base $299 incl. 40, $4/worker to ceiling 120', () => {
    expect(TIERS_V1_1.growth.baseCents).toBe(29_900);
    expect(TIERS_V1_1.growth.includedWorkers).toBe(40);
    expect(TIERS_V1_1.growth.ceiling).toBe(120);
    expect(computeMonthlyBillCents('growth', 41)).toBe(29_900 + 400);
  });

  it('Enterprise: from $1,000, priced from worker 1, $3.25 to 400 then $3.00, no ceiling', () => {
    expect(TIERS_V1_1.enterprise.baseCents).toBe(100_000);
    expect(TIERS_V1_1.enterprise.includedWorkers).toBe(0);
    expect(TIERS_V1_1.enterprise.ceiling).toBeNull();
    expect(TIERS_V1_1.enterprise.negotiated).toBe(true);
    // band boundary: worker 400 vs 401 marginal rate
    const at400 = computeMonthlyBillCents('enterprise', 400);
    const at401 = computeMonthlyBillCents('enterprise', 401);
    expect(at401 - at400).toBe(300); // 401st worker billed at $3.00, not $3.25
  });

  it('no annual cadence exists (Decision D) — tiers carry no yearly price', () => {
    for (const tier of Object.values(TIERS_V1_1)) {
      expect('yearlyCents' in tier).toBe(false);
      expect('annualCents' in tier).toBe(false);
    }
  });
});

describe('v1.1 tier resolution by worker count (Decision A: 121 = Enterprise/sales)', () => {
  it('Starter ≤ 25, Growth 26–120, Enterprise > 120', () => {
    expect(resolveTierByWorkers(1)).toBe('starter');
    expect(resolveTierByWorkers(25)).toBe('starter');
    expect(resolveTierByWorkers(26)).toBe('growth');
    expect(resolveTierByWorkers(120)).toBe('growth');
    expect(resolveTierByWorkers(121)).toBe('enterprise');
    expect(resolveTierByWorkers(5000)).toBe('enterprise');
  });

  it('workers beyond a tier ceiling are not billed by that tier (cap at ceiling)', () => {
    // Starter is capped at 25 even if asked for more (you would be on Growth).
    expect(computeMonthlyBillCents('starter', 100)).toBe(computeMonthlyBillCents('starter', 25));
  });
});
