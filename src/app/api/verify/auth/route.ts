// Flostruction Verify — Token Auth
// GET /api/verify/auth?token=[verify_token]
// Validates supervisor verify_token and returns supervisor info.
// Token grants READ + APPROVE access for that supervisor's sites only.

import { NextResponse } from 'next/server';
// W1.4 (2026-06-10): token-anchored repository replaces the raw client.
import { supervisorAuthByToken } from '@/lib/db/repositories/verify.repo';
import { getClientIP, RATE_LIMITS } from '@/lib/security/rate-limit';
import { checkRateLimitDurable } from '@/lib/security/rate-limit-durable';
import { mintActionToken } from '@/lib/verify/action-token';

import { routeLogger } from '@/lib/logger';
export async function GET(request: Request) {
  const log = routeLogger('GET /api/verify/auth', request.headers.get('x-request-id'));
  log.info({ method: 'GET' }, 'request.received');
  // Rate limit check
  const clientIP = getClientIP(request);
  const rl = await checkRateLimitDurable(`auth:${clientIP}`, RATE_LIMITS.AUTH);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 401 });
  }

  const { data: supervisor, error } = await supervisorAuthByToken(token);

  if (error || !supervisor) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  return NextResponse.json({
    supervisor_id: supervisor.id,
    company_id: supervisor.company_id,
    name: supervisor.name,
    phone: supervisor.phone,
    site_ids: supervisor.site_ids,
    // Short-lived action token the page replays on approve/dispute. Bounds
    // the action window; enforced only when VERIFY_REQUIRE_ACTION_TOKEN=true.
    action_token: mintActionToken(supervisor.id, Date.now()),
  });
}
