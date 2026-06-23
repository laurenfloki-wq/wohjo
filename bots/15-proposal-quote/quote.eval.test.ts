// Golden evals — bot 15 (proposal/quote). Pricing must match Spec v1.0 exactly.
// Worked monthly bills below are the ex-GST subtotal, straight from Spec v1.0.

import { describe, it, expect } from 'vitest';
import { buildQuote, recommendTier, eligibleTiers } from './handler';

const dollars = (q: { subtotalCents: number }) => q.subtotalCents / 100;

describe('bot 15 — proposal/quote (Pricing Spec v1.0)', () => {
  it('Starter: base only within the 10 included workers', () => {
    expect(dollars(buildQuote('starter', 10))).toBe(99);
    expect(buildQuote('starter', 10).lines).toHaveLength(1);
  });

  it('Starter: AUD 5/worker on workers 11–25, up to the ceiling', () => {
    expect(dollars(buildQuote('starter', 25))).toBe(174); // 99 + 15 x 5
  });

  it('Starter: rejects worker counts beyond the ceiling (25)', () => {
    expect(() => buildQuote('starter', 26)).toThrow();
  });

  it('Growth: base within 40 included, then AUD 4/worker to the ceiling', () => {
    expect(dollars(buildQuote('growth', 26))).toBe(299);
    expect(dollars(buildQuote('growth', 75))).toBe(439); // 299 + 35 x 4
    expect(dollars(buildQuote('growth', 120))).toBe(619); // 299 + 80 x 4
  });

  it('Growth: rejects worker counts beyond the ceiling (120)', () => {
    expect(() => buildQuote('growth', 121)).toThrow();
  });

  it('Enterprise: priced from worker 1 on marginal bands, no ceiling', () => {
    // 121: 1000 + 121 x 3.25 = 1,393.25 (Spec worked example rounds to AUD 1,393).
    expect(buildQuote('enterprise', 121).subtotalCents).toBe(139325);
    expect(dollars(buildQuote('enterprise', 220))).toBe(1715); // 1000 + 220 x 3.25
    expect(dollars(buildQuote('enterprise', 400))).toBe(2300); // 1000 + 400 x 3.25
    expect(dollars(buildQuote('enterprise', 600))).toBe(2900); // 1000 + 400 x 3.25 + 200 x 3.00
  });

  it('adds 10% GST exactly on the monthly subtotal', () => {
    const q = buildQuote('starter', 0);
    expect(q.totalCents).toBe(Math.round(q.subtotalCents * 1.1));
    expect(q.gstCents).toBe(q.totalCents - q.subtotalCents);
  });

  it('carries contractual onboarding and minimum term', () => {
    expect(buildQuote('starter', 10).minTermMonths).toBe(3);
    expect(buildQuote('growth', 50).onboardingMinCents).toBe(150000);
    const ent = buildQuote('enterprise', 200);
    expect(ent.onboardingMinCents).toBe(500000);
    expect(ent.onboardingMaxCents).toBe(1500000);
    expect(ent.minTermMonths).toBe(12);
  });

  it('rejects negative worker counts', () => {
    expect(() => buildQuote('enterprise', -1)).toThrow();
  });
});

describe('bot 15 — consultative tier recommendation', () => {
  it('recommends Starter for a small firm', () => {
    const r = recommendTier(8); // within Starter included (10)
    expect(r.recommended).toBe('starter');
    expect(r.options[0]?.tier).toBe('starter');
  });

  it('moves to Growth past the Starter ceiling (25)', () => {
    expect(eligibleTiers(26)).not.toContain('starter');
    expect(recommendTier(26).recommended).toBe('growth');
  });

  it('moves to Enterprise past the Growth ceiling — Decision A', () => {
    expect(eligibleTiers(121)).toEqual(['enterprise']);
    const r = recommendTier(121);
    expect(r.recommended).toBe('enterprise');
    expect(r.quote.subtotalCents).toBe(139325);
  });

  it('always recommends the cheapest eligible tier (invariant)', () => {
    for (const workers of [8, 25, 26, 120, 121, 300, 600]) {
      const r = recommendTier(workers);
      const minTotal = Math.min(...r.options.map((o) => o.totalCents));
      expect(r.quote.totalCents).toBe(minTotal);
      expect(r.options[0]?.tier).toBe(r.recommended);
      expect(r.savingVsNextCents).toBeGreaterThanOrEqual(0);
    }
  });

  it('the recommended quote matches the recommended tier', () => {
    const r = recommendTier(75);
    expect(r.quote.tier).toBe(r.recommended);
    expect(r.options[0]?.totalCents).toBeLessThanOrEqual(r.options[1]?.totalCents ?? Infinity);
  });
});
