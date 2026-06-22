// Golden evals — bot 21 (churn-risk), FLOSMOSIS-calibrated.

import { describe, it, expect } from 'vitest';
import { scoreChurn, rankChurn, type UsageSignals } from './handler';

const s = (over: Partial<UsageSignals> & { tenantId: string }): UsageSignals => ({
  daysSinceLastSeal: 0,
  activeWorkerTrendPct: 0,
  onboardingComplete: true,
  failedPayments: 0,
  supportTicketsOpen: 0,
  ...over,
});

describe('bot 21 — churn-risk (calibrated)', () => {
  it('scores a healthy, sealing tenant low with no reasons', () => {
    const r = scoreChurn(s({ tenantId: 't1' }));
    expect(r.band).toBe('low');
    expect(r.reasons).toEqual([]);
    expect(r.primaryDriver).toBe('healthy');
  });

  it('treats a stopped-sealing tenant as the top driver', () => {
    const r = scoreChurn(s({ tenantId: 't2', daysSinceLastSeal: 14 }));
    expect(r.band).toBe('high');
    expect(r.primaryDriver).toContain('no sealed clock-on');
  });

  it('flags an account that never completed onboarding', () => {
    const r = scoreChurn(s({ tenantId: 't3', onboardingComplete: false }));
    expect(r.reasons.some((x) => x.includes('never reached first sealed clock-on'))).toBe(true);
  });

  it('compounds signals and ranks most-at-risk first', () => {
    const ranked = rankChurn([
      s({ tenantId: 'ok' }),
      s({
        tenantId: 'danger',
        daysSinceLastSeal: 20,
        activeWorkerTrendPct: -30,
        failedPayments: 1,
      }),
    ]);
    expect(ranked[0]?.tenantId).toBe('danger');
    expect(ranked[0]?.band).toBe('high');
  });
});
