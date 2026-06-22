// Golden evals — bot 17 (renewal & expansion). Deterministic detection.

import { describe, it, expect } from 'vitest';
import { detectRenewalsAndExpansion, type Subscription } from './handler';

function sub(over: Partial<Subscription> & { tenantId: string }): Subscription {
  return { renewalInDays: 365, activeWorkersAtSignup: 10, activeWorkersNow: 10, ...over };
}

describe('bot 17 — renewal & expansion', () => {
  it('flags an imminent renewal', () => {
    const f = detectRenewalsAndExpansion([sub({ tenantId: 't1', renewalInDays: 14 })]);
    expect(f[0]?.reason).toBe('renewal_due');
    expect(f[0]?.renewalInDays).toBe(14);
  });

  it('flags expansion with growth evidence', () => {
    const f = detectRenewalsAndExpansion([
      sub({ tenantId: 't2', activeWorkersAtSignup: 10, activeWorkersNow: 15 }),
    ]);
    expect(f[0]?.reason).toBe('expansion');
    expect(f[0]?.workerGrowth).toBe(5);
    expect(f[0]?.workerGrowthPct).toBe(50);
  });

  it('combines both and ignores steady-state', () => {
    const f = detectRenewalsAndExpansion([
      sub({ tenantId: 't3', renewalInDays: 5, activeWorkersAtSignup: 10, activeWorkersNow: 20 }),
      sub({ tenantId: 't4' }), // steady, far renewal -> ignored
    ]);
    expect(f).toHaveLength(1);
    expect(f[0]?.reason).toBe('renewal_and_expansion');
  });
});
