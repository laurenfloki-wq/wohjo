// L2.1 — POST /api/worker/mfa/verify
//
// Body:  { challenge_id: uuid, code: 6-digit-string }
// Auth:  worker session (Supabase phone-OTP).
//
// Behaviour:
//   1. Resolves the worker identity from the session.
//   2. Verifies the code via worker-mfa.verifyChallenge.
//   3. Returns { grant_id, expires_at, challenge_for }.
//
// On wrong code: 401 with attempts-remaining hint.
// On expired / consumed: 410.
// On too-many-attempts: 429.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { routeLogger } from '@/lib/logger';
import { requireWorkerIdentity } from '@/lib/auth/session';
import { AuthorizationError } from '@/lib/auth/errors';
import { verifyChallenge, deviceBindingFromUserAgent } from '@/lib/auth/worker-mfa';
// AUTH-4 — durable (cross-instance) rate-limit parity with the issue route.
import { checkRateLimitDurable } from '@/lib/security/rate-limit-durable';
import { getClientIP } from '@/lib/security/rate-limit';

const BodySchema = z.object({
  challenge_id: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/, 'must be 6 digits'),
});

// AUTH-4 — verify-side throttle. The per-challenge attempts cap (10) only
// bounds guesses against ONE challenge; nothing stopped a hijacked session (or
// an IP) from churning fresh challenges and spraying verify across them, and
// the in-memory limiter resets per serverless instance. The legitimate ceiling
// is 5 challenges/hr × 10 attempts = 50 verify calls/hr/worker, so cap the
// worker at that and give a shared depot IP a little headroom above it.
const MFA_VERIFY_WINDOW_MS = 60 * 60 * 1000;
const MFA_VERIFY_MAX_PER_WORKER = 50;
const MFA_VERIFY_MAX_PER_IP = 80;

export async function POST(request: Request) {
  const log = routeLogger(
    'POST /api/worker/mfa/verify',
    request.headers.get('x-request-id'),
  );
  log.info({}, 'request.received');

  try {
    const identity = await requireWorkerIdentity(log);

    // AUTH-4 — IP + worker durable throttle (parity with /mfa/issue). Checked
    // after auth so the worker key is available; an over-limit IP or worker is
    // rejected before we touch the challenge row. Both limits share one window.
    const ip = getClientIP(request);
    const [workerRl, ipRl] = await Promise.all([
      checkRateLimitDurable(`mfa-verify-worker:${identity.workerId}`, {
        windowMs: MFA_VERIFY_WINDOW_MS,
        maxRequests: MFA_VERIFY_MAX_PER_WORKER,
      }),
      checkRateLimitDurable(`mfa-verify-ip:${ip}`, {
        windowMs: MFA_VERIFY_WINDOW_MS,
        maxRequests: MFA_VERIFY_MAX_PER_IP,
      }),
    ]);
    if (!workerRl.allowed || !ipRl.allowed) {
      const resetAt = !workerRl.allowed ? workerRl.resetAt : ipRl.resetAt;
      log.warn(
        { workerId: identity.workerId, scope: !workerRl.allowed ? 'worker' : 'ip' },
        'mfa.verify.rate_limited',
      );
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
      return NextResponse.json(
        {
          error: 'RATE_LIMITED',
          retry_after_seconds: retryAfterSeconds,
          message: 'Too many verification attempts. Try again later.',
        },
        { status: 429 },
      );
    }

    const json = (await request.json().catch(() => null)) as unknown;
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_BODY', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // AUTH-5 — bind the minted grant to this device's user-agent so it can't
    // be ridden from a different device on a hijacked session.
    const deviceBinding = deviceBindingFromUserAgent(request.headers.get('user-agent'));
    const grant = await verifyChallenge(
      log,
      identity.workerId,
      parsed.data.challenge_id,
      parsed.data.code,
      deviceBinding,
    );

    return NextResponse.json(
      {
        grant_id: grant.grantId,
        challenge_for: grant.challengeFor,
        expires_at: grant.expiresAt,
      },
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    const msg = err instanceof Error ? err.message : 'unknown';
    log.error({ err: msg }, 'mfa.verify.unhandled');
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
