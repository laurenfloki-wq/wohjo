import { describe, it, expect } from 'vitest';
import {
  mapRunShiftsToApproved,
  derivePayrollCsv,
  sha256Hex,
  packState,
  type RunShiftRow,
} from './run-detail';

const ROW: RunShiftRow = {
  id: '11111111-1111-4111-8111-111111111111',
  company_id: 'c1',
  worker_id: 'w1',
  site_id: 's1',
  shift_date: '2026-06-10',
  start_time: '2026-06-09T21:00:00.000Z', // 07:00 Australia/Sydney
  end_time: '2026-06-10T05:30:00.000Z', // 15:30 Australia/Sydney
  break_minutes: 30,
  total_hours: '8.00',
  status: 'EXPORTED',
  receipt_id: 'FSTR-AB12CD34',
  worker_note: '',
  workers: { first_name: 'Joao', last_name: 'Silva', employee_id: 'EMP-JOAO', pay_rate: '28.47' },
  sites: { name: 'Mt Stromlo Works' },
};

describe('run-detail re-derivation', () => {
  it('maps an EXPORTED row to the PAYROLL_APPROVED canonical tag', () => {
    const [a] = mapRunShiftsToApproved([ROW]);
    expect(a.status).toBe('PAYROLL_APPROVED');
    expect(a.worker_employee_id).toBe('EMP-JOAO');
    expect(a.total_hours).toBe(8);
    expect(a.pay_rate).toBe(28.47);
  });

  it('derives a header + one data row Employment Hero CSV', () => {
    const csv = derivePayrollCsv([ROW]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(
      'Employee ID,Employee Name,Date,Start Time,Finish Time,Break (mins),Ordinary Hours,Notes',
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('EMP-JOAO');
    expect(lines[1]).toContain('Joao Silva');
    expect(lines[1]).toContain('10/06/2026');
    expect(lines[1]).toContain('8.00');
  });

  it('is deterministic — same rows hash to the same file', () => {
    expect(sha256Hex(derivePayrollCsv([ROW]))).toBe(sha256Hex(derivePayrollCsv([ROW])));
  });

  it('packState: ready when a fingerprint is present, generating otherwise', () => {
    expect(packState('a'.repeat(64)).ready).toBe(true);
    expect(packState(null).ready).toBe(false);
    expect(packState(null).short).toBe('pack generating');
  });
});
