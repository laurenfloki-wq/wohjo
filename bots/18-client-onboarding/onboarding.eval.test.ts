// Golden evals — bot 18 (client onboarding). Deterministic setup state machine.

import { describe, it, expect } from 'vitest';
import { nextStep, progressPct, isComplete } from './handler';

describe('bot 18 — client onboarding', () => {
  it('advances through setup steps to first seal', () => {
    expect(nextStep('company_profile')).toBe('sites');
    expect(nextStep('first_worker_invited')).toBe('first_seal');
    expect(nextStep('first_seal')).toBeNull();
  });

  it('reports progress percentage', () => {
    expect(progressPct('company_profile')).toBe(20);
    expect(progressPct('first_seal')).toBe(100);
  });

  it('marks complete only at first seal', () => {
    expect(isComplete('supervisors')).toBe(false);
    expect(isComplete('first_seal')).toBe(true);
  });
});
