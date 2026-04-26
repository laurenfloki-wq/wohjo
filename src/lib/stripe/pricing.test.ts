import { describe, it, expect } from 'vitest';
import {
  TIERS,
  tierById,
  resolveTierFromUsage,
  ENTERPRISE_HEADSUP_WORKER_THRESHOLD,
  ENTERPRISE_HEADSUP_SHIFT_THRESHOLD,
  FOUNDING_COHORT_CAP,
  FOUNDING_PRICE_LOCK_DAYS,
} from './pricing';

describe('TIERS catalogue', () => {
  it('has exactly 5 tiers in the documented order', () => {
    expect(TIERS.map((t) => t.id)).toEqual([
      'founding', 'standard', 'growth', 'scale', 'enterprise',
    ]);
  });

  it('founding has no annual prepay (locked) and is not public', () => {
    const f = tierById('founding');
    expect(f.yearly_aud_cents).toBeNull();
    expect(f.is_public).toBe(false);
    expect(f.is_auto_assignable).toBe(false);
  });

  it('enterprise is public + sales-led (not auto-assignable)', () => {
    const e = tierById('enterprise');
    expect(e.is_public).toBe(true);
    expect(e.is_auto_assignable).toBe(false);
    expect(e.monthly_aud_cents).toBe(0); // bespoke
  });

  it('annual price is 90% of monthly × 12 for standard/growth/scale', () => {
    for (const id of ['standard', 'growth', 'scale'] as const) {
      const t = tierById(id);
      const expected = Math.round(t.monthly_aud_cents * 12 * 0.9);
      expect(t.yearly_aud_cents).toBe(expected);
    }
  });
});

describe('resolveTierFromUsage — Option C hybrid (MAX rule)', () => {
  it('5 workers / 10 shifts → standard', () => {
    expect(resolveTierFromUsage({ active_worker_count: 5, sealed_shifts_last_30d: 10 })).toBe('standard');
  });

  it('25 workers / 500 shifts (boundary) → standard', () => {
    expect(resolveTierFromUsage({ active_worker_count: 25, sealed_shifts_last_30d: 500 })).toBe('standard');
  });

  it('26 workers / 100 shifts → growth (worker count promotes)', () => {
    expect(resolveTierFromUsage({ active_worker_count: 26, sealed_shifts_last_30d: 100 })).toBe('growth');
  });

  it('5 workers / 600 shifts → growth (shift volume promotes)', () => {
    expect(resolveTierFromUsage({ active_worker_count: 5, sealed_shifts_last_30d: 600 })).toBe('growth');
  });

  it('30 workers / 100 shifts → growth, NOT scale (workers within Growth bracket)', () => {
    expect(resolveTierFromUsage({ active_worker_count: 30, sealed_shifts_last_30d: 100 })).toBe('growth');
  });

  it('30 workers / 1500 shifts → growth (both within Growth bracket)', () => {
    expect(resolveTierFromUsage({ active_worker_count: 30, sealed_shifts_last_30d: 1500 })).toBe('growth');
  });

  it('100 workers / 100 shifts → scale (worker count promotes past growth)', () => {
    expect(resolveTierFromUsage({ active_worker_count: 100, sealed_shifts_last_30d: 100 })).toBe('scale');
  });

  it('5 workers / 4500 shifts → scale (shift volume promotes past growth)', () => {
    expect(resolveTierFromUsage({ active_worker_count: 5, sealed_shifts_last_30d: 4500 })).toBe('scale');
  });

  it('201 workers → enterprise', () => {
    expect(resolveTierFromUsage({ active_worker_count: 201, sealed_shifts_last_30d: 100 })).toBe('enterprise');
  });

  it('5001 shifts → enterprise', () => {
    expect(resolveTierFromUsage({ active_worker_count: 5, sealed_shifts_last_30d: 5001 })).toBe('enterprise');
  });

  it('200 workers / 5000 shifts (both at Scale max) → scale', () => {
    expect(resolveTierFromUsage({ active_worker_count: 200, sealed_shifts_last_30d: 5000 })).toBe('scale');
  });

  it('zero usage → standard (the floor tier)', () => {
    expect(resolveTierFromUsage({ active_worker_count: 0, sealed_shifts_last_30d: 0 })).toBe('standard');
  });
});

describe('Enterprise heads-up thresholds (80% of Scale)', () => {
  it('worker threshold is 80% of Scale max_workers (200) = 160', () => {
    expect(ENTERPRISE_HEADSUP_WORKER_THRESHOLD).toBe(160);
  });
  it('shift threshold is 80% of Scale max_shifts_30d (5000) = 4000', () => {
    expect(ENTERPRISE_HEADSUP_SHIFT_THRESHOLD).toBe(4000);
  });
});

describe('Founding cohort constants', () => {
  it('cap is 20', () => {
    expect(FOUNDING_COHORT_CAP).toBe(20);
  });
  it('lock duration is 1095 days (~3 years)', () => {
    expect(FOUNDING_PRICE_LOCK_DAYS).toBe(1095);
  });
});
