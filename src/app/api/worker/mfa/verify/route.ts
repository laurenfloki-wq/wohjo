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
import { verifyChallenge } from '@/lib/auth/worker-mfa';

const BodySchema = z.object({
  challenge_id: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/, 'must be 6 digits'),
});

export async function POST(request: Request) {
  const log = routeLogger(
    'POST /api/worker/mfa/verify',
    request.headers.get('x-request-id'),
  );
  log.info({}, 'request.received');

  try {
    const identity = await requireWorkerIdentity(log);

    const json = (await request.json().catch(() => null)) as unknown;
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_BODY', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const grant = await verifyChallenge(
      log,
      identity.workerId,
      parsed.data.challenge_id,
      parsed.data.code,
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
