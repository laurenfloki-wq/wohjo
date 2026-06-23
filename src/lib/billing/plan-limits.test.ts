// BILL-4 — pure-function tests for the v1.1 plan-ceiling logic.

import { describe, it, expect, vi } from 'vitest';
import {
  PLAN_CEILINGS_V1,
  v1CeilingForStoredTier,
  evaluatePlanCeiling,
  reportPlanCeiling,
} from './plan-limits';

describe('v1.1 plan ceilings', () => {
  it('matches the Pricing Specification v1.1 worker ceilings', () => {
    expect(PLAN_CEILINGS_V1.starter).toBe(25);
    expect(PLAN_CEILINGS_V1.growth).toBe(120);
    expect(PLAN_CEILINGS_V1.enterprise).toBeNull();
  });
});

describe('v1CeilingForStoredTier — legacy tier → v1.1 ceiling', () => {
  it('maps standard → Starter ceiling (25)', () => {
    expect(v1CeilingForStoredTier('standard')).toBe(25);
  });
  it('maps growth → Growth ceiling (120)', () => {
    expect(v1CeilingForStoredTier('growth')).toBe(120);
  });
  it('treats founding / scale / enterprise / null / unknown as unbounded', () => {
    for (const t of ['founding', 'scale', 'enterprise', null, undefined, 'wat']) {
      expect(v1CeilingForStoredTier(t as string | null | undefined)).toBeNull();
    }
  });
});

describe('evaluatePlanCeiling', () => {
  it('is under-ceiling with positive headroom below the cap', () => {
    const ev = evaluatePlanCeiling({ storedTier: 'standard', activeWorkerCount: 20 });
    expect(ev).toEqual({ ceiling: 25, activeWorkerCount: 20, atOrOver: false, headroom: 5 });
  });

  it('flags at-ceiling (count === ceiling) as atOrOver with zero headroom', () => {
    const ev = evaluatePlanCeiling({ storedTier: 'standard', activeWorkerCount: 25 });
    expect(ev.atOrOver).toBe(true);
    expect(ev.headroom).toBe(0);
  });

  it('flags over-ceiling with negative headroom', () => {
    const ev = evaluatePlanCeiling({ storedTier: 'growth', activeWorkerCount: 130 });
    expect(ev.atOrOver).toBe(true);
    expect(ev.headroom).toBe(-10);
  });

  it('never flags an unbounded tier, however large the count', () => {
    const ev = evaluatePlanCeiling({ storedTier: 'enterprise', activeWorkerCount: 100_000 });
    expect(ev).toEqual({
      ceiling: null,
      activeWorkerCount: 100_000,
      atOrOver: false,
      headroom: null,
    });
  });

  it('does not enforce a NULL-tier (unprovisioned) company', () => {
    const ev = evaluatePlanCeiling({ storedTier: null, activeWorkerCount: 999 });
    expect(ev.atOrOver).toBe(false);
  });
});

describe('reportPlanCeiling — non-blocking signal', () => {
  const makeLog = () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }) as never;

  it('emits billing.plan_ceiling.exceeded when at/over', () => {
    const log = makeLog();
    const ev = reportPlanCeiling(log, { companyId: 'c1', storedTier: 'standard', activeWorkerCount: 26 });
    expect(ev.atOrOver).toBe(true);
    expect((log as unknown as { warn: ReturnType<typeof vi.fn> }).warn).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'c1', ceiling: 25, activeWorkerCount: 26, overBy: 1 }),
      'billing.plan_ceiling.exceeded',
    );
  });

  it('stays silent when under the ceiling', () => {
    const log = makeLog();
    reportPlanCeiling(log, { companyId: 'c1', storedTier: 'standard', activeWorkerCount: 10 });
    expect((log as unknown as { warn: ReturnType<typeof vi.fn> }).warn).not.toHaveBeenCalled();
  });

  it('stays silent for an unbounded / unprovisioned tier', () => {
    const log = makeLog();
    reportPlanCeiling(log, { companyId: 'c1', storedTier: null, activeWorkerCount: 5000 });
    expect((log as unknown as { warn: ReturnType<typeof vi.fn> }).warn).not.toHaveBeenCalled();
  });
});
