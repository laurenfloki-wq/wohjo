import { describe, it, expect } from 'vitest';
import { recomputeGenericHash, evidenceVerdict, receiptOf, type RecordEventRow } from './evidence';

const BASE: RecordEventRow = {
  id: 'e1',
  company_id: 'c1',
  worker_id: 'w1',
  site_id: 's1',
  event_type: 'SHIFT_APPROVED',
  event_data: { receipt_id: 'FSTR-AB12CD34', hours: '8.00' },
  event_hash: null,
  previous_event_hash: null,
  created_at: '2026-06-10T05:30:00.000Z',
};

describe('record evidence verify', () => {
  it('recompute is deterministic', () => {
    expect(recomputeGenericHash(BASE)).toBe(recomputeGenericHash(BASE));
    expect(recomputeGenericHash(BASE)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches when the stored hash equals the recompute', () => {
    const stored = recomputeGenericHash(BASE);
    expect(evidenceVerdict({ ...BASE, event_hash: stored }).matches).toBe(true);
  });

  it('does not match a foreign hash (typed-scheme or tampered)', () => {
    expect(evidenceVerdict({ ...BASE, event_hash: 'deadbeef' }).matches).toBe(false);
  });

  it('extracts a receipt_id when present', () => {
    expect(receiptOf(BASE.event_data)).toBe('FSTR-AB12CD34');
    expect(receiptOf(null)).toBeNull();
    expect(receiptOf({})).toBeNull();
  });
});
