// Day 5 P1.3 — GAP-A3-002 closure. worker_id from client removed.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
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
  const log = routeLogger('GET /api/field/earnings/week', request.headers.get('x-request-id'));
  log.info({ method: 'GET' }, 'request.received');

  let workerId: string;
  try {
    ({ workerId } = await requireWorkerIdentity(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const supabase = createServiceClient();

  const { data: worker } = await supabase
    .from('workers')
    .select('pay_rate')
    .eq('id', workerId)
    .single();

  if (!worker) {
    return NextResponse.json({ error: 'Worker not found' }, { status: 404 });
  }

  const weekStart = getMondayOfWeek(new Date());
  const { data: shifts } = await supabase
    .from('shifts')
    .select('total_hours, status')
    .eq('worker_id', workerId)
    .gte('shift_date', weekStart);

  const totalHours = (shifts ?? []).reduce((sum: number, s: { total_hours: string | null; status: string }) => sum + parseFloat(s.total_hours ?? '0'), 0);
  const payRate = parseFloat(worker.pay_rate);
  const grossEarnings = (totalHours * payRate).toFixed(2);

  return NextResponse.json({
    week_start: weekStart,
    total_hours: totalHours.toFixed(2),
    pay_rate: payRate.toFixed(2),
    gross_earnings: grossEarnings,
    shift_count: (shifts ?? []).length,
  });
}
