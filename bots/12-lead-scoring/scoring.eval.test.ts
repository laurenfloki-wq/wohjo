// Golden evals — bot 12 (lead scoring). Deterministic + explainable.

import { describe, it, expect } from 'vitest';
import { scoreLead, type LeadSignals } from './handler';

function signals(over: Partial<LeadSignals> = {}): LeadSignals {
  return {
    industryIsConstructionLabourHire: false,
    hasLabourHireLicence: false,
    workerCount: 0,
    openedEmail: false,
    visitedPricing: false,
    bookedDemo: false,
    ...over,
  };
}

describe('bot 12 — lead scoring', () => {
  it('scores a strong ICP lead hot and explains why', () => {
    const r = scoreLead(
      signals({
        industryIsConstructionLabourHire: true,
        hasLabourHireLicence: true,
        workerCount: 80,
        bookedDemo: true,
      }),
    );
    expect(r.band).toBe('hot');
    expect(r.score).toBe(30 + 20 + 15 + 25);
    expect(r.contributions.map((c) => c.rule)).toContain('booked_demo');
  });

  it('clamps and bands a cold lead', () => {
    const r = scoreLead(signals({ openedEmail: true }));
    expect(r.score).toBe(5);
    expect(r.band).toBe('cold');
  });

  it('does not double-count worker bands', () => {
    const r = scoreLead(signals({ workerCount: 20 }));
    expect(r.contributions.map((c) => c.rule)).toEqual(['workers_gte_10']);
  });
});
