// Flostruction Command — Approvals Data API
// GET /api/command/approvals?filter=all|needs_review|ready_to_export
// Returns shifts with worker + site + supervisor approval data for the current pay period.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';

import { routeLogger } from '@/lib/logger';
export async function GET(request: Request) {
  const log = routeLogger('GET /api/command/approvals', request.headers.get('x-request-id'));
  log.info({ method: 'GET' }, 'request.received');

  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const url = new URL(request.url);
  const filter = url.searchParams.get('filter') ?? 'all';

  const supabase = createServiceClient();

  // Get current pay period (Mon-Sun of current week)
  const now = new Date();
  const day = now.getDay();
  const mondayDiff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(mondayDiff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const weekStart = monday.toISOString().split('T')[0];
  const weekEnd = sunday.toISOString().split('T')[0];

  // GAP-A3-001 closure: always scope to session's companyId. No client input.
  let query = supabase
    .from('shifts')
    .select(`
      id, company_id, worker_id, site_id, shift_date, start_time, end_time,
      break_minutes, total_hours, receipt_id, status, confidence_score,
      anomaly_flags, supervisor_approved_by, supervisor_approved_at,
      payroll_approved_by, payroll_approved_at, created_at, updated_at,
      workers(id, first_name, last_name, employee_id, pay_rate),
      sites(id, name)
    `)
    .eq('company_id', companyId)
    .gte('shift_date', weekStart)
    .lte('shift_date', weekEnd)
    .order('shift_date', { ascending: false });

  if (filter === 'needs_review') {
    query = query.in('status', ['SUBMITTED', 'SUPERVISOR_APPROVED', 'DISPUTED']);
  } else if (filter === 'ready_to_export') {
    query = query.eq('status', 'PAYROLL_APPROVED');
  }

  const { data: shifts, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get supervisor names for approved shifts
  const approvedByIds = [...new Set(
    (shifts ?? [])
      .map((s: { supervisor_approved_by: string | null }) => s.supervisor_approved_by)
      .filter(Boolean)
  )];

  let supervisorMap: Record<string, { name: string; phone: string }> = {};
  if (approvedByIds.length > 0) {
    const { data: supervisors } = await supabase
      .from('supervisors')
      .select('id, name, phone')
      .in('id', approvedByIds as string[]);

    supervisorMap = Object.fromEntries(
      (supervisors ?? []).map((s: { id: string; name: string; phone: string }) => [s.id, { name: s.name, phone: s.phone }])
    );
  }

  // Compute summary stats
  const allShifts = shifts ?? [];
  const submitted = allShifts.filter((s: { status: string }) => s.status === 'SUBMITTED').length;
  const supervisorApproved = allShifts.filter((s: { status: string }) => s.status === 'SUPERVISOR_APPROVED').length;
  const payrollApproved = allShifts.filter((s: { status: string }) => s.status === 'PAYROLL_APPROVED').length;
  const disputed = allShifts.filter((s: { status: string }) => s.status === 'DISPUTED').length;
  const verified = allShifts.filter((s: { confidence_score: number | null }) =>
    (s.confidence_score ?? 0) >= 70
  ).length;

  // Count SMS vs Flostruction Verify approvals (from shift_events would be more accurate,
  // but for the summary bar we approximate based on presence of supervisor_approved_by)

  return NextResponse.json({
    shifts: allShifts,
    supervisors: supervisorMap,
    summary: {
      total: allShifts.length,
      submitted,
      supervisor_approved: supervisorApproved,
      payroll_approved: payrollApproved,
      disputed,
      verified,
      week_start: weekStart,
      week_end: weekEnd,
    },
  });
}
