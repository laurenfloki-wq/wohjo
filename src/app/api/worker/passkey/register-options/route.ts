// Phase A (WORKER_PASSKEY_ACCESS) — POST /api/worker/passkey/register-options
// Issues WebAuthn registration options. Authorised ONLY by an active code-verify
// grant (the SMS floor). Flag-gated; every response carries the SMS fallback.

import { NextResponse } from 'next/server';
import { routeLogger } from '@/lib/logger';
import { requireWorkerIdentity } from '@/lib/auth/session';
import { AuthorizationError } from '@/lib/auth/errors';
import { workerPasskeyAccessEnabled, hasActiveCodeVerifyGrant } from '@/lib/auth/worker-passkey';
import { registerOptions } from '@/lib/auth/worker-passkey-ceremony';

export async function POST(request: Request) {
  const log = routeLogger(
    'POST /api/worker/passkey/register-options',
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
    const options = await registerOptions(identity.workerId, identity.phone);
    return NextResponse.json({ options, fallback: 'sms' });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.code, fallback: 'sms' }, { status: err.status });
    }
    log.error(
      { err: err instanceof Error ? err.message : 'unknown' },
      'passkey.register_options.failed',
    );
    return NextResponse.json({ error: 'INTERNAL', fallback: 'sms' }, { status: 500 });
  }
}
