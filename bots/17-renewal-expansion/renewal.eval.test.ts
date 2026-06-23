// Golden evals — bot 17 (renewal & expansion), FLOSMOSIS-calibrated.

import { describe, it, expect } from 'vitest';
import { detectRenewalsAndExpansion, type Subscription } from './handler';

function sub(over: Partial<Subscription> & { tenantId: string }): Subscription {
  return {
    renewalInDays: 365,
    activeWorkersAtSignup: 10,
    activeWorkersNow: 10,
    daysSinceLastSeal: 0,
    ...over,
  };
}

describe('bot 17 — renewal & expansion (calibrated)', () => {
  it('flags expansion on per-active-worker growth with an upsell play', () => {
    const f = detectRenewalsAndExpansion([
      sub({ tenantId: 't1', activeWorkersAtSignup: 10, activeWorkersNow: 14 }),
    ]);
    expect(f[0]?.reason).toBe('expansion');
    expect(f[0]?.play).toMatch(/next pricing tier/);
  });

  it('prioritises an at-risk renewal (imminent + sealing stalled) above all', () => {
    const f = detectRenewalsAndExpansion([
      sub({ tenantId: 'expand', activeWorkersAtSignup: 10, activeWorkersNow: 20 }),
      sub({ tenantId: 'atrisk', renewalInDays: 20, daysSinceLastSeal: 12 }),
    ]);
    expect(f[0]?.tenantId).toBe('atrisk');
    expect(f[0]?.reason).toBe('renewal_at_risk');
  });

  it('combines renewal + expansion into a tier-up renewal', () => {
    const f = detectRenewalsAndExpansion([
      sub({
        tenantId: 't3',
        renewalInDays: 20,
        activeWorkersAtSignup: 10,
        activeWorkersNow: 25,
        daysSinceLastSeal: 1,
      }),
    ]);
    expect(f[0]?.reason).toBe('renewal_and_expansion');
  });

  it('ignores steady, far-off accounts', () => {
    expect(detectRenewalsAndExpansion([sub({ tenantId: 'steady' })])).toEqual([]);
  });
});
