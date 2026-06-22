// Golden evals — bot 20 (onboarding health). Deterministic stalled detection.

import { describe, it, expect } from 'vitest';
import { nextMilestone, findStalled, type OnboardingState } from './handler';

describe('bot 20 — onboarding health', () => {
  it('knows the next milestone', () => {
    expect(nextMilestone('invited')).toBe('account_created');
    expect(nextMilestone('first_worker')).toBe('first_seal');
    expect(nextMilestone('first_seal')).toBeNull();
  });

  it('surfaces stalled, incomplete onboardings most-stalled first', () => {
    const states: OnboardingState[] = [
      { tenantId: 'fresh', milestone: 'invited', daysSinceLastProgress: 1 },
      { tenantId: 'stuck', milestone: 'account_created', daysSinceLastProgress: 5 },
      { tenantId: 'verystuck', milestone: 'invited', daysSinceLastProgress: 9 },
      { tenantId: 'done', milestone: 'first_seal', daysSinceLastProgress: 30 },
    ];
    const stalled = findStalled(states, 3);
    expect(stalled.map((s) => s.tenantId)).toEqual(['verystuck', 'stuck']);
    expect(stalled[0]?.nextMilestone).toBe('account_created');
  });
});
