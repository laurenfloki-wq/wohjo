// Golden evals — bot 39 (R&D tax evidence). Deterministic eligibility + sum.

import { describe, it, expect } from 'vitest';
import { tagEligibleSpend, type SpendItem } from './handler';

const item = (over: Partial<SpendItem> & { id: string }): SpendItem => ({
  category: 'core_rd',
  amountCents: 10000,
  commitShas: ['abc123'],
  ...over,
});

describe('bot 39 — R&D tax evidence', () => {
  it('tags eligible categories with commit evidence and sums them', () => {
    const r = tagEligibleSpend([
      item({ id: '1', category: 'experimental_development', amountCents: 5000 }),
      item({ id: '2', category: 'core_rd', amountCents: 3000 }),
      item({ id: '3', category: 'sales', amountCents: 9999 }),
    ]);
    expect(r.eligible.map((i) => i.id)).toEqual(['1', '2']);
    expect(r.ineligible.map((i) => i.id)).toEqual(['3']);
    expect(r.totalEligibleCents).toBe(8000);
  });

  it('excludes eligible-category spend that lacks commit evidence', () => {
    const r = tagEligibleSpend([item({ id: '1', category: 'core_rd', commitShas: [] })]);
    expect(r.eligible).toEqual([]);
    expect(r.totalEligibleCents).toBe(0);
  });
});
