import { describe, it, expect } from 'vitest';
import { selectRunShifts, isAgedShift } from './run-selection';
import type { ApprovedShift } from '@/lib/export/types';

function shift(id: string, shift_date: string): ApprovedShift {
  return {
    id,
    worker_id: 'w',
    worker_employee_id: 'E1',
    worker_first_name: 'A',
    worker_last_name: 'B',
    site_id: 's',
    site_name: 'Site',
    company_id: 'c',
    shift_date,
    start_time: '',
    end_time: '',
    break_minutes: 0,
    total_hours: 8,
    pay_rate: 30,
    status: 'PAYROLL_APPROVED',
    receipt_id: 'FSTR-1',
    notes: '',
  };
}

describe('selectRunShifts', () => {
  it('includes everything when nothing is held, period spans all shift dates', () => {
    const sel = selectRunShifts([shift('a', '2026-06-10'), shift('b', '2026-06-17')]);
    expect(sel.included.map((s) => s.id)).toEqual(['a', 'b']);
    expect(sel.heldOut).toHaveLength(0);
    expect(sel.payPeriodStart).toBe('2026-06-10');
    expect(sel.payPeriodEnd).toBe('2026-06-17');
  });

  it('removes held shifts and recomputes the period from what remains', () => {
    const sel = selectRunShifts(
      [shift('old', '2026-05-01'), shift('a', '2026-06-16'), shift('b', '2026-06-17')],
      ['old'],
    );
    expect(sel.included.map((s) => s.id)).toEqual(['a', 'b']);
    expect(sel.heldOut.map((s) => s.id)).toEqual(['old']);
    expect(sel.payPeriodStart).toBe('2026-06-16'); // aged shift held → period tightens
    expect(sel.payPeriodEnd).toBe('2026-06-17');
  });

  it('held shifts never disappear — they are returned in heldOut, not dropped', () => {
    const sel = selectRunShifts([shift('a', '2026-06-17')], ['a']);
    expect(sel.included).toHaveLength(0);
    expect(sel.heldOut.map((s) => s.id)).toEqual(['a']);
    expect(sel.payPeriodStart).toBeNull();
  });
});

describe('isAgedShift', () => {
  it('is true only for dates before the cutoff', () => {
    expect(isAgedShift('2026-06-09', '2026-06-11')).toBe(true);
    expect(isAgedShift('2026-06-11', '2026-06-11')).toBe(false);
    expect(isAgedShift('2026-06-17', '2026-06-11')).toBe(false);
    expect(isAgedShift(null, '2026-06-11')).toBe(false);
  });
});
