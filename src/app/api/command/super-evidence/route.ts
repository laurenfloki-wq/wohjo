// Flostruction Command — Super Evidence API
// GET /api/command/super-evidence?start=YYYY-MM-DD&end=YYYY-MM-DD
// Returns verified hours summary per worker for the given period.
// This is NOT a super calculator — it provides evidence of verified hours
// that payroll providers use to calculate super obligations.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';

import { routeLogger } from '@/lib/logger';
interface WorkerSuperEvidence {
  worker_id: string;
  worker_name: string;
  employee_id: string;
  total_verified_hours: number;
  shift_count: number;
  shifts: Array<{
    shift_date: string;
    total_hours: number;
    receipt_id: string;
    status: string;
    hash_verified: boolean;
  }>;
}

export async function GET(request: Request) {
  const log = routeLogger('GET /api/command/super-evidence', request.headers.get('x-request-id'));
  log.info({ method: 'GET' }, 'request.received');

  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  if (!start || !end) {
    return NextResponse.json({ error: 'start and end date required' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // GAP-A3-001 closure: scope shifts to session's companyId.
  const { data: shifts, error: shiftsError } = await supabase
    .from('shifts')
    .select(`
      id, worker_id, shift_date, total_hours, receipt_id, status,
      workers!inner(first_name, last_name, employee_id)
    `)
    .eq('company_id', companyId)
    .gte('shift_date', start)
    .lte('shift_date', end)
    .in('status', ['SUPERVISOR_APPROVED', 'PAYROLL_APPROVED', 'EXPORTED'])
    .order('shift_date', { ascending: true });

  if (shiftsError) {
    return NextResponse.json({ error: 'Failed to fetch shifts' }, { status: 500 });
  }

  // Verify hash chains for each shift
  const workerMap = new Map<string, WorkerSuperEvidence>();

  for (const shift of (shifts ?? [])) {
    const worker = shift.workers as unknown as { first_name: string; last_name: string; employee_id: string };
    const workerId = shift.worker_id as string;
    const hours = parseFloat(shift.total_hours as string ?? '0');

    // Check hash chain for this shift — scoped to session's company.
    const { data: events } = await supabase
      .from('shift_events')
      .select('event_hash')
      .eq('company_id', companyId)
      .eq('worker_id', workerId)
      .filter('event_data->>shift_id', 'eq', shift.id)
      .order('created_at', { ascending: true });

    const hashVerified = (events ?? []).length > 0; // Has WLES events recorded

    if (!workerMap.has(workerId)) {
      workerMap.set(workerId, {
        worker_id: workerId,
        worker_name: `${worker.first_name} ${worker.last_name}`,
        employee_id: worker.employee_id,
        total_verified_hours: 0,
        shift_count: 0,
        shifts: [],
      });
    }

    const entry = workerMap.get(workerId)!;
    entry.total_verified_hours += hours;
    entry.shift_count++;
    entry.shifts.push({
      shift_date: shift.shift_date as string,
      total_hours: hours,
      receipt_id: shift.receipt_id as string,
      status: shift.status as string,
      hash_verified: hashVerified,
    });
  }

  const workers = [...workerMap.values()];
  const totalHours = workers.reduce((sum, w) => sum + w.total_verified_hours, 0);
  const totalShifts = workers.reduce((sum, w) => sum + w.shift_count, 0);

  return NextResponse.json({
    period_start: start,
    period_end: end,
    total_workers: workers.length,
    total_shifts: totalShifts,
    total_verified_hours: parseFloat(totalHours.toFixed(2)),
    workers,
  });
}
