// Phase A (WORKER_PASSKEY_ACCESS) — POST /api/worker/passkey/register-verify
// Verifies the registration response + persists the credential. Authorised ONLY
// by an active code-verify grant (the SMS floor). Flag-gated; SMS fallback always.

import { NextResponse } from 'next/server';
import { routeLogger } from '@/lib/logger';
import { requireWorkerIdentity } from '@/lib/auth/session';
import { AuthorizationError } from '@/lib/auth/errors';
import { workerPasskeyAccessEnabled, hasActiveCodeVerifyGrant } from '@/lib/auth/worker-passkey';
import { registerVerify } from '@/lib/auth/worker-passkey-ceremony';

export async function POST(request: Request) {
  const log = routeLogger(
    'POST /api/worker/passkey/register-verify',
    request.headers.get('x-request-id'),
  );
  if (!workerPasskeyAccessEnabled()) {
    return NextResponse.json({ error: 'NOT_ENABLED', fallback: 'sms' }, { status: 404 });
  }
  try {
    const identity = await requireWorkerIdentity(log);
    if (!(await hasActiveCodeVerifyGrant(identity.workerId))) {
      return NextResponse.json(
        {
          error: 'SMS_VERIFY_REQUIRED',
          fallback: 'sms',
          message: 'Verify with an SMS code first, then enrol this device.',
        },
        { status: 403 },
      );
    }
    const body = (await request.json().catch(() => null)) as {
      response?: unknown;
      deviceLabel?: string;
    } | null;
    if (!body?.response) {
      return NextResponse.json({ error: 'INVALID_BODY', fallback: 'sms' }, { status: 400 });
    }
    const { verified } = await registerVerify(
      identity.workerId,
      body.response as Parameters<typeof registerVerify>[1],
      { deviceLabel: body.deviceLabel ?? null },
    );
    if (!verified) {
      return NextResponse.json({ error: 'REGISTRATION_FAILED', fallback: 'sms' }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.code, fallback: 'sms' }, { status: err.status });
    }
    log.error(
      { err: err instanceof Error ? err.message : 'unknown' },
      'passkey.register_verify.failed',
    );
    return NextResponse.json({ error: 'INTERNAL', fallback: 'sms' }, { status: 500 });
  }
}
