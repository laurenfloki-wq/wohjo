import { NextResponse } from 'next/server';
// W6(b) (2026-06-11): admin TOTP MFA surface. Calls getCompanyIdForSession
// with skipMfaCheck -- these routes must stay reachable for an admin who
// has not yet satisfied MFA, or enrolment/verification would deadlock.
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { checkRateLimitDurable } from '@/lib/security/rate-limit-durable';
import { routeLogger } from '@/lib/logger';
import { startEnrolment } from '@/lib/auth/admin-mfa';

export async function POST(request: Request) {
  const log = routeLogger('POST /api/command/mfa/enroll', request.headers.get('x-request-id'));
  log.info({ method: 'POST' }, 'request.received');

  try {
    const membership = await getCompanyIdForSession(log, { skipMfaCheck: true });

    const rl = await checkRateLimitDurable(`admin-mfa-enroll:${membership.userId}`, {
      windowMs: 60 * 60 * 1000,
      maxRequests: 5,
    });
    if (!rl.allowed) {
      log.warn({ userId: membership.userId }, 'admin.mfa.enroll.rate_limited');
      return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });
    }

    const r = await startEnrolment(log, membership.userId, `command-admin-${membership.companyId}`);
    return NextResponse.json({ secretBase32: r.secretBase32, otpauthUri: r.otpauthUri });
  } catch (err) {
    return authErrorResponse(err);
  }
}
