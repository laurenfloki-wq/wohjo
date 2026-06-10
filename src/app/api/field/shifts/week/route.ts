// Day 5 P1.3 — GAP-A3-002 closure. worker_id from client removed.

import { NextResponse } from 'next/server';
import { workerShiftsSelfRepo } from '@/lib/db/repositories/shifts.repo';
import { requireWorkerIdentity } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';

import { routeLogger } from '@/lib/logger';
function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

export async function GET(request: Request) {
  const log = routeLogger('GET /api/field/shifts/week', request.headers.get('x-request-id'));
  log.info({ method: 'GET' }, 'request.received');

  let workerId: string;
  try {
    ({ workerId } = await requireWorkerIdentity(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const weekStart = getMondayOfWeek(new Date());

  const { data: shifts, error } = await workerShiftsSelfRepo(workerId).listWeek(weekStart);

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch shifts' }, { status: 500 });
  }

  return NextResponse.json({ shifts: shifts ?? [], week_start: weekStart });
}
