// Flostruction Command — Approvals Data API
// GET /api/command/approvals?filter=all|needs_review|ready_to_export
// Returns shifts with worker + site + supervisor approval data for the current pay period.

import { NextResponse } from 'next/server';
// W1.4 (2026-06-10): company-scoped repositories replace the raw
// client; the route applies its filter refinement to the repo's base
// builder (bytes unchanged).
import { shiftsRepo } from '@/lib/db/repositories/shifts.repo';
import { supervisorNamesByIds } from '@/lib/db/repositories/supervisors.repo';
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

  const repo = shiftsRepo(companyId);

  // Current pay period (Mon-Sun of current week, AEST-naive — same as before).
  const now = new Date();
  const day = now.getDay();
  const mondayDiff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(mondayDiff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const weekStart = monday.toISOString().split('T')[0];
  const weekEnd = sunday.toISOString().split('T')[0];

  // CRACK 221 fix — J42SACCX visibility regression. Pre-fix, the route always
  // restricted shifts to the current Mon-Sun window. A shift that aged past
  // its week (e.g. FSTR-J42SACCX dated 2026-05-01, dispatch ran 2026-05-11)
  // became invisible on /command/approvals even though it sat at
  // SUPERVISOR_APPROVED awaiting payroll action. Lauren couldn't Final
  // Approve what she couldn't see.
  //
  // New rule: pending shifts (SUPERVISOR_APPROVED, PAYROLL_APPROVED, DISPUTED)
  // are always visible regardless of age — they need a payroll-admin decision
  // no matter when the shift was worked. SUBMITTED shifts also stay visible
  // forever; supervisor approval is the gate, age is not. EXPORTED + IN_PROGRESS
  // are scoped to the current week to keep the default view tight.
  //
  // GAP-A3-001 closure: always scope to session's companyId. No client input.
  const PENDING_STATUSES = ['SUBMITTED', 'SUPERVISOR_APPROVED', 'PAYROLL_APPROVED', 'DISPUTED'];

  let query = repo.approvalsBaseQuery();

  if (filter === 'needs_review') {
    // Always show anything that needs payroll-admin attention — no date filter.
    query = query.in('status', ['SUBMITTED', 'SUPERVISOR_APPROVED', 'DISPUTED']);
  } else if (filter === 'ready_to_export') {
    // PAYROLL_APPROVED stays visible until EXPORTED — no date filter.
    query = query.eq('status', 'PAYROLL_APPROVED');
  } else {
    // 'all' tab — current week PLUS any pending shift regardless of age.
    // PostgREST OR syntax: comma between conjuncts inside or(), and-clause
    // wraps the date-range conjunction. status.in.(...) handles the pending set.
    const pendingList = PENDING_STATUSES.join(',');
    query = query.or(
      `and(shift_date.gte.${weekStart},shift_date.lte.${weekEnd}),status.in.(${pendingList})`,
    );
  }

  const { data: shifts, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get supervisor names for approved shifts
  const approvedByIds = [
    ...new Set(
      (shifts ?? [])
        .map((s: { supervisor_approved_by: string | null }) => s.supervisor_approved_by)
        .filter(Boolean),
    ),
  ];

  let supervisorMap: Record<string, { name: string; phone: string }> = {};
  if (approvedByIds.length > 0) {
    const { data: supervisors } = await supervisorNamesByIds(approvedByIds as string[]);

    supervisorMap = Object.fromEntries(
      (supervisors ?? []).map((s: { id: string; name: string; phone: string }) => [
        s.id,
        { name: s.name, phone: s.phone },
      ]),
    );
  }

  // Compute summary stats
  const allShifts = shifts ?? [];
  const submitted = allShifts.filter((s: { status: string }) => s.status === 'SUBMITTED').length;
  const supervisorApproved = allShifts.filter(
    (s: { status: string }) => s.status === 'SUPERVISOR_APPROVED',
  ).length;
  const payrollApproved = allShifts.filter(
    (s: { status: string }) => s.status === 'PAYROLL_APPROVED',
  ).length;
  const disputed = allShifts.filter((s: { status: string }) => s.status === 'DISPUTED').length;
  const verified = allShifts.filter(
    (s: { confidence_score: number | null }) => (s.confidence_score ?? 0) >= 70,
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
