// Flostruction Verify — Token Auth
// GET /api/verify/auth?token=[verify_token]
// Validates supervisor verify_token and returns supervisor info.
// Token grants READ + APPROVE access for that supervisor's sites only.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getClientIP, RATE_LIMITS } from '@/lib/security/rate-limit';
import { checkRateLimitDurable } from '@/lib/security/rate-limit-durable';

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

  const supabase = createServiceClient();

  const { data: supervisor, error } = await supabase
    .from('supervisors')
    .select('id, company_id, name, phone, site_ids, is_active, verify_token')
    .eq('verify_token', token)
    .eq('is_active', true)
    .single();

  if (error || !supervisor) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  return NextResponse.json({
    supervisor_id: supervisor.id,
    company_id: supervisor.company_id,
    name: supervisor.name,
    phone: supervisor.phone,
    site_ids: supervisor.site_ids,
  });
}
