// Flostruction Verify — List Shifts for Supervisor
// GET /api/verify/shifts?token=[verify_token]&status=SUBMITTED
//
// Day-7 P0-1 security patch (2026-04-23):
//   Previously accepted `supervisor_id` as a URL query param with no token
//   verification. Any UUID guesser could enumerate worker data.
//   Now requires `verify_token`; supervisor_id is derived server-side from
//   the matched row. Rate-limited per IP.

import { NextResponse } from 'next/server';
// W1.4 (2026-06-10): token-anchored repositories replace the raw client.
import { supervisorForShiftList, shiftsForSites } from '@/lib/db/repositories/verify.repo';
import { getClientIP, RATE_LIMITS } from '@/lib/security/rate-limit';
import { checkRateLimitDurable } from '@/lib/security/rate-limit-durable';
import { routeLogger } from '@/lib/logger';

export async function GET(request: Request) {
  const log = routeLogger('GET /api/verify/shifts', request.headers.get('x-request-id'));
  log.info({ method: 'GET' }, 'request.received');

  // Rate limit (AUTH tier — tighter than API because the token-guess
  // surface is the only defence if the token ever leaks).
  const clientIP = getClientIP(request);
  const rl = await checkRateLimitDurable(`verify.shifts:${clientIP}`, RATE_LIMITS.AUTH);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const status = url.searchParams.get('status') ?? 'SUBMITTED';

  if (!token) {
    return NextResponse.json({ error: 'token required' }, { status: 401 });
  }

  // Resolve supervisor via token. Token is the ONLY authentication.
  // supervisor_id is derived from the matched row — never trusted
  // from client input.
  const { data: supervisor, error: supError } = await supervisorForShiftList(token);

  if (supError || !supervisor) {
    log.warn({ ip: clientIP }, 'verify.shifts.invalid_token');
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  if (!supervisor.site_ids || (supervisor.site_ids as string[]).length === 0) {
    return NextResponse.json({ shifts: [] });
  }

  // Fetch shifts for this supervisor's sites only.
  const { data: shifts, error: shiftsError } = await shiftsForSites(
    supervisor.site_ids as string[],
    status,
  );

  if (shiftsError) {
    log.error({ err: shiftsError.message }, 'verify.shifts.query_failed');
    return NextResponse.json({ error: 'Could not load shifts' }, { status: 500 });
  }

  return NextResponse.json({ shifts: shifts ?? [] });
}
