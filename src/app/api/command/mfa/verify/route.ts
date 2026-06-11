import { NextResponse } from 'next/server';
// W6(b) (2026-06-11): admin TOTP MFA surface. Calls getCompanyIdForSession
// with skipMfaCheck -- these routes must stay reachable for an admin who
// has not yet satisfied MFA, or enrolment/verification would deadlock.
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { checkRateLimitDurable } from '@/lib/security/rate-limit-durable';
import { routeLogger } from '@/lib/logger';
import { verifyAdminMfa } from '@/lib/auth/admin-mfa';

export async function POST(request: Request) {
  const log = routeLogger('POST /api/command/mfa/verify', request.headers.get('x-request-id'));
  log.info({ method: 'POST' }, 'request.received');

  try {
    const membership = await getCompanyIdForSession(log, { skipMfaCheck: true });

    // TOTP guessing defence: 10^6 codes, 10 tries per 10 minutes per
    // admin makes online guessing impractical (the in-lib replay guard
    // additionally burns each accepted step).
    const rl = await checkRateLimitDurable(`admin-mfa-verify:${membership.userId}`, {
      windowMs: 10 * 60 * 1000,
      maxRequests: 10,
    });
    if (!rl.allowed) {
      log.warn({ userId: membership.userId }, 'admin.mfa.verify.rate_limited');
      return NextResponse.json({ error: 'Too many attempts. Wait a few minutes.' }, { status: 429 });
    }

    const body = (await request.json().catch(() => ({}))) as { code?: unknown };
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!/^[0-9]{6}$/.test(code)) {
      return NextResponse.json({ error: 'code must be 6 digits' }, { status: 400 });
    }

    const r = await verifyAdminMfa(log, membership.userId, code, {
      userAgent: request.headers.get('user-agent'),
    });
    return NextResponse.json({ ok: true, grantExpiresAt: r.grantExpiresAt });
  } catch (err) {
    return authErrorResponse(err);
  }
}
