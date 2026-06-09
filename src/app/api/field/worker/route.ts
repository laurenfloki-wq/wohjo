// Day 5 P1.3 — GAP-A3-002 closure. Worker identity is now derived from
// the Supabase phone-OTP session via requireWorkerIdentity; the client
// no longer submits a phone or worker_id.

import { NextResponse } from 'next/server';
import { workerSelfRepo } from '@/lib/db/repositories/workers.repo';
import { requireWorkerIdentity } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { getClientIP, RATE_LIMITS } from '@/lib/security/rate-limit';
import { checkRateLimitDurable } from '@/lib/security/rate-limit-durable';

import { routeLogger } from '@/lib/logger';
export async function GET(request: Request) {
  const log = routeLogger('GET /api/field/worker', request.headers.get('x-request-id'));
  log.info({ method: 'GET' }, 'request.received');
  // Rate limit check
  const clientIP = getClientIP(request);
  const rl = await checkRateLimitDurable(`auth:${clientIP}`, RATE_LIMITS.AUTH);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  let workerId: string;
  try {
    ({ workerId } = await requireWorkerIdentity(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const { data: worker, error } = await workerSelfRepo(workerId).getProfile();

  if (error || !worker) {
    return NextResponse.json({ error: 'Worker not found' }, { status: 404 });
  }

  // Never return pay_rate to client — pay is calculated by payroll provider
  return NextResponse.json({ worker });
}
