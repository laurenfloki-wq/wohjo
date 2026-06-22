// Golden evals — bot 15 (proposal/quote). Pricing must match Spec v1.0 exactly.

import { describe, it, expect } from 'vitest';
import { buildQuote } from './handler';
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
