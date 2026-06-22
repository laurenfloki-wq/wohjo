// Golden evals — bot 15 (proposal/quote). Pricing must match Spec v1.0 exactly.

import { describe, it, expect } from 'vitest';
import { buildQuote, recommendTier } from './handler';
import { PRICING_SPEC_V1 } from './pricing-spec';

describe('bot 15 — proposal/quote', () => {
  it('prices base only when within included workers', () => {
    const q = buildQuote('starter', 10); // starter includes 10
    expect(q.lines).toHaveLength(1);
    expect(q.subtotalCents).toBe(PRICING_SPEC_V1.starter.monthlyBaseCents);
  });

  it('adds per-active-worker beyond the included count', () => {
    const q = buildQuote('growth', 60); // growth includes 50 -> 10 billable
    const rate = PRICING_SPEC_V1.growth;
    expect(q.subtotalCents).toBe(rate.monthlyBaseCents + 10 * rate.perActiveWorkerCents);
    expect(q.lines).toHaveLength(2);
  });

  it('adds 10% GST exactly', () => {
    const q = buildQuote('starter', 0);
    expect(q.totalCents).toBe(Math.round(q.subtotalCents * 1.1));
    expect(q.gstCents).toBe(q.totalCents - q.subtotalCents);
  });

  it('rejects negative worker counts', () => {
    expect(() => buildQuote('scale', -1)).toThrow();
  });
});

describe('bot 15 — consultative tier recommendation', () => {
  it('recommends the cheapest tier at a small worker count', () => {
    const r = recommendTier(8); // within Starter included (10)
    expect(r.recommended).toBe('starter');
    expect(r.options[0]?.tier).toBe('starter');
  });

  it('recommends the genuinely cheapest tier (invariant, pricing-agnostic)', () => {
    // The recommendation must always be the minimum-cost tier at that worker
    // count, whatever the loaded Pricing Spec values are.
    for (const workers of [8, 60, 150, 300]) {
      const r = recommendTier(workers);
      const minTotal = Math.min(...r.options.map((o) => o.totalCents));
      expect(r.quote.totalCents).toBe(minTotal);
      expect(r.options[0]?.tier).toBe(r.recommended);
      expect(r.savingVsNextCents).toBeGreaterThanOrEqual(0);
    }
  });

  it('the recommended quote matches the recommended tier', () => {
    const r = recommendTier(60);
    expect(r.quote.tier).toBe(r.recommended);
    // options are sorted cheapest-first
    expect(r.options[0]?.totalCents).toBeLessThanOrEqual(r.options[1]?.totalCents ?? Infinity);
  });
});
