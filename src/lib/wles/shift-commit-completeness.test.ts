import { describe, it, expect } from 'vitest';
import { nonBaselineOrphans, SHIFT_COMMIT_BASELINE } from './shift-commit-completeness';

const SEED = '99999999-9999-4999-8999-999999999992';

describe('nonBaselineOrphans (audit WLES-6)', () => {
  it('returns nothing when there are no orphans', () => {
    expect(nonBaselineOrphans([])).toEqual([]);
  });

  it('filters out the known seed/pilot baseline orphan', () => {
    expect(nonBaselineOrphans([{ shift_id: SEED, status: 'EXPORTED' }])).toEqual([]);
  });

  it('flags a real orphan not in the baseline', () => {
    const real = { shift_id: 'aaaaaaaa-0000-4000-8000-000000000001', status: 'PAYROLL_APPROVED' };
    expect(nonBaselineOrphans([real])).toEqual([real]);
  });

  it('keeps real orphans while dropping baselined ones', () => {
    const real = { shift_id: 'bbbbbbbb-0000-4000-8000-000000000002', status: 'SUBMITTED' };
    const out = nonBaselineOrphans([{ shift_id: SEED, status: 'EXPORTED' }, real]);
    expect(out).toEqual([real]);
  });

  it('the seed shift is in the committed baseline', () => {
    expect(SHIFT_COMMIT_BASELINE.has(SEED)).toBe(true);
  });
});
