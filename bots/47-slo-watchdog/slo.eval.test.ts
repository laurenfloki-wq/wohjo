// Golden evals — bot 47 (SLO watchdog). Deterministic burn-rate maths.

import { describe, it, expect } from 'vitest';
import { assessBurn } from './handler';

describe('bot 47 — SLO watchdog', () => {
  it('does not page when within budget', () => {
    const a = assessBurn({ slo: 0.99, totalRequests: 1000, failedRequests: 5 });
    expect(a.errorRate).toBeCloseTo(0.005, 6);
    expect(a.burnRate).toBeCloseTo(0.5, 6); // 0.005 / 0.01
    expect(a.page).toBe(false);
    expect(a.rollback).toBe(false);
  });

  it('pages on 2x+ burn', () => {
    const a = assessBurn({ slo: 0.99, totalRequests: 1000, failedRequests: 30 });
    expect(a.burnRate).toBeCloseTo(3, 6);
    expect(a.page).toBe(true);
    expect(a.rollback).toBe(false);
  });

  it('recommends rollback on fast burn', () => {
    const a = assessBurn({ slo: 0.99, totalRequests: 1000, failedRequests: 200 });
    expect(a.burnRate).toBeCloseTo(20, 6);
    expect(a.rollback).toBe(true);
  });

  it('handles an empty window without dividing by zero', () => {
    const a = assessBurn({ slo: 0.999, totalRequests: 0, failedRequests: 0 });
    expect(a.errorRate).toBe(0);
    expect(a.page).toBe(false);
  });
});
