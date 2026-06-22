// Golden evals — bot 21 (churn-risk). Explainable score + ranking.

import { describe, it, expect } from 'vitest';
import { scoreChurn, rankChurn, type UsageSignals } from './handler';

const s = (over: Partial<UsageSignals> & { tenantId: string }): UsageSignals => ({
  daysSinceLastSeal: 0,
  activeWorkerTrendPct: 0,
  supportTicketsOpen: 0,
  failedPayments: 0,
  ...over,
});

describe('bot 21 — churn-risk', () => {
  it('scores a healthy tenant low with no reasons', () => {
    const r = scoreChurn(s({ tenantId: 't1' }));
    expect(r.band).toBe('low');
    expect(r.reasons).toEqual([]);
  });

  it('scores high with explained reasons', () => {
    const r = scoreChurn(
      s({ tenantId: 't2', daysSinceLastSeal: 20, activeWorkerTrendPct: -30, failedPayments: 1 }),
    );
    expect(r.band).toBe('high');
    expect(r.reasons.length).toBeGreaterThanOrEqual(3);
  });

  it('ranks most-at-risk first', () => {
    const ranked = rankChurn([
      s({ tenantId: 'low' }),
      s({ tenantId: 'high', daysSinceLastSeal: 20, failedPayments: 2 }),
    ]);
    expect(ranked[0]?.tenantId).toBe('high');
  });
});
