// Pay-run detail — deterministic re-derivation of a kept run's payroll
// file from its sealed shift ids.
//
// A kept run stores only metadata + a file_hash, never the file bytes
// (genesis `exports` has no payroll_file_storage_path). The payroll file
// is therefore RE-DERIVED on demand from the run's shift_ids through the
// same Employment Hero formatter that produced it originally — so the
// download carries "the same mathematics" the page promises, and the
// caller can re-check it against the stored file_hash. Post-export shifts
// are terminal EXPORTED, so we read by id (any status), never by the
// PAYROLL_APPROVED export filter.

import { createHash } from 'crypto';
import type { ApprovedShift } from '@/lib/export/types';
import { EmploymentHeroFormatter } from '@/lib/export/formatters/employment-hero';

/** Raw shift row as read for a kept run (workers/sites joined). */
export interface RunShiftRow {
  id: string;
  company_id?: string | null;
  worker_id?: string | null;
  site_id?: string | null;
  shift_date: string;
  start_time: string;
  end_time: string | null;
  break_minutes: number | null;
  total_hours: string | number | null;
  status: string;
  receipt_id: string;
  worker_note: string | null;
  workers: {
    first_name: string;
    last_name: string;
    employee_id: string;
    pay_rate: string | number | null;
  } | null;
  sites: { name: string } | null;
}

/**
 * Map kept-run shift rows to the canonical ApprovedShift shape the
 * formatters consume. Status is forced to the PAYROLL_APPROVED tag — the
 * formatter's `format()` never inspects status (only `validate()` does),
 * and a kept run's shifts are by definition the ones that were approved
 * and sealed into this export.
 */
export function mapRunShiftsToApproved(rows: RunShiftRow[]): ApprovedShift[] {
  return rows.map((s) => ({
    id: s.id,
    worker_id: s.worker_id ?? '',
    worker_employee_id: s.workers?.employee_id ?? '',
    worker_first_name: s.workers?.first_name ?? '',
    worker_last_name: s.workers?.last_name ?? '',
    site_id: s.site_id ?? '',
    site_name: s.sites?.name ?? '',
    company_id: s.company_id ?? '',
    shift_date: s.shift_date,
    start_time: s.start_time ? new Date(s.start_time).toISOString() : '',
    end_time: s.end_time ? new Date(s.end_time).toISOString() : '',
    break_minutes: s.break_minutes ?? 0,
    total_hours: typeof s.total_hours === 'number' ? s.total_hours : parseFloat(s.total_hours ?? '0'),
    pay_rate:
      typeof s.workers?.pay_rate === 'number'
        ? s.workers.pay_rate
        : parseFloat((s.workers?.pay_rate as string) ?? '0'),
    status: 'PAYROLL_APPROVED' as const,
    receipt_id: s.receipt_id,
    notes: s.worker_note ?? '',
  }));
}

/** Re-derive the Employment Hero payroll CSV for a kept run. */
export function derivePayrollCsv(rows: RunShiftRow[]): string {
  return EmploymentHeroFormatter.format(mapRunShiftsToApproved(rows));
}

/** sha-256 of a string, hex — used to compare against a stored file_hash. */
export function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/** Human pack state for the run-detail + kept-run list. */
export function packState(fingerprint: string | null | undefined): {
  ready: boolean;
  label: string;
  short: string;
} {
  if (fingerprint && fingerprint.length >= 12) {
    return {
      ready: true,
      label: 'Evidence Pack sealed',
      short: `pack ${fingerprint.slice(0, 6)}…${fingerprint.slice(-4)}`,
    };
  }
  return {
    ready: false,
    label: 'Evidence Pack still generating',
    short: 'pack generating',
  };
}
