import { NextResponse } from 'next/server';
// W6(b) (2026-06-11): admin TOTP MFA surface. Calls getCompanyIdForSession
// with skipMfaCheck -- these routes must stay reachable for an admin who
// has not yet satisfied MFA, or enrolment/verification would deadlock.
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { routeLogger } from '@/lib/logger';
import { getAdminMfaStatus } from '@/lib/auth/admin-mfa';

export async function GET(request: Request) {
  const log = routeLogger('GET /api/command/mfa/status', request.headers.get('x-request-id'));
  log.info({ method: 'GET' }, 'request.received');

  try {
    const membership = await getCompanyIdForSession(log, { skipMfaCheck: true });
    const status = await getAdminMfaStatus(log, membership.userId);
    return NextResponse.json(status);
  } catch (err) {
    return authErrorResponse(err);
  }
}
