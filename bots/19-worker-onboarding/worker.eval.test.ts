// Golden evals — bot 19 (worker onboarding). Idempotent, no-skip progression.

import { describe, it, expect } from 'vitest';
import { isValidAdvance, applyAdvance, stepKey } from './handler';

describe('bot 19 — worker onboarding', () => {
  it('only allows single-step advances', () => {
    expect(isValidAdvance('invited', 'pwa_installed')).toBe(true);
    expect(isValidAdvance('invited', 'first_clock_on')).toBe(false); // skip
  });

  it('is idempotent on replay of the same step', () => {
    expect(applyAdvance('pwa_installed', 'pwa_installed')).toBe('pwa_installed');
  });

  it('rejects an invalid (skipping) transition', () => {
    expect(() => applyAdvance('invited', 'geofence_granted')).toThrow();
  });

  it('derives a stable idempotency key per worker + step', () => {
    expect(stepKey('w1', 'first_clock_on')).toBe('worker-onboarding:w1:first_clock_on');
  });
});
