// Flostruction Export — getApprovedShifts()
// Provider-agnostic data fetcher for the export pipeline.
// Fetches PAYROLL_APPROVED shifts for a company within a date range.

import { shiftsRepo } from '@/lib/db/repositories/shifts.repo';
import type { ApprovedShift } from './types';

// Raw row shape from Supabase relational query
interface ShiftRow {
  id: string;
  company_id: string | null;
  worker_id: string | null;
  site_id: string | null;
  shift_date: string;
  start_time: string;
  end_time: string | null;
  break_minutes: number | null;
  total_hours: string | null;
  status: string;
  receipt_id: string;
  worker_note: string | null;
  workers: {
    id: string;
    first_name: string;
    last_name: string;
    employee_id: string;
    pay_rate: string;
  } | null;
  sites: {
    id: string;
    name: string;
  } | null;
}

interface GetApprovedShiftsParams {
  companyId: string;
  payPeriodStart: string;   // YYYY-MM-DD
  payPeriodEnd: string;     // YYYY-MM-DD
}

/**
 * Fetch all PAYROLL_APPROVED shifts for a company within a pay period.
 * Returns the canonical ApprovedShift shape consumed by all formatters.
 *
 * Only shifts with status = 'PAYROLL_APPROVED' are returned.
 * This is the single source of truth for export data — all formatters
 * consume this same output.
 */
export async function getApprovedShifts(
  params: GetApprovedShiftsParams
): Promise<ApprovedShift[]> {
  const { companyId, payPeriodStart, payPeriodEnd } = params;

  // W1.3 (2026-06-10): query relocated verbatim into the company-scoped
  // shifts repository; this helper keeps the canonical mapping only.
  const { data: shifts, error } = await shiftsRepo(companyId).listApprovedForExport(
    payPeriodStart,
    payPeriodEnd,
  );

  if (error) {
    throw new Error(`Failed to fetch approved shifts: ${error.message}`);
  }

  if (!shifts || shifts.length === 0) {
    return [];
  }

  // Map to canonical ApprovedShift shape
  return (shifts as unknown as ShiftRow[]).map((s) => {
    const worker = s.workers;
    const site = s.sites;

    return {
      id: s.id,
      worker_id: s.worker_id ?? '',
      worker_employee_id: worker?.employee_id ?? '',
      worker_first_name: worker?.first_name ?? '',
      worker_last_name: worker?.last_name ?? '',
      site_id: s.site_id ?? '',
      site_name: site?.name ?? '',
      company_id: s.company_id ?? '',
      shift_date: s.shift_date,
      start_time: s.start_time ? new Date(s.start_time).toISOString() : '',
      end_time: s.end_time ? new Date(s.end_time).toISOString() : '',
      break_minutes: s.break_minutes ?? 0,
      total_hours: parseFloat(s.total_hours ?? '0'),
      pay_rate: parseFloat(worker?.pay_rate ?? '0'),
      status: 'PAYROLL_APPROVED' as const,
      receipt_id: s.receipt_id,
      notes: s.worker_note ?? '',
    };
  });
}
