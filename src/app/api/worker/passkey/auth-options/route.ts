// Phase A (WORKER_PASSKEY_ACCESS) — POST /api/worker/passkey/auth-options
// Issues WebAuthn authentication options for a worker's enrolled passkeys.
// Flag-gated; every response carries the SMS fallback.

import { NextResponse } from 'next/server';
import { routeLogger } from '@/lib/logger';
import { requireWorkerIdentity } from '@/lib/auth/session';
import { AuthorizationError } from '@/lib/auth/errors';
import { workerPasskeyAccessEnabled } from '@/lib/auth/worker-passkey';
import { authOptions } from '@/lib/auth/worker-passkey-ceremony';

export async function POST(request: Request) {
  const log = routeLogger('POST /api/worker/passkey/auth-options', request.headers.get('x-request-id'));
  if (!workerPasskeyAccessEnabled()) {
    return NextResponse.json({ error: 'NOT_ENABLED', fallback: 'sms' }, { status: 404 });
  }
  try {
    const identity = await requireWorkerIdentity(log);
    const options = await authOptions(identity.workerId);
    return NextResponse.json({ options, fallback: 'sms' });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.code, fallback: 'sms' }, { status: err.status });
    }
    log.error({ err: err instanceof Error ? err.message : 'unknown' }, 'passkey.auth_options.failed');
    return NextResponse.json({ error: 'INTERNAL', fallback: 'sms' }, { status: 500 });
  }
}
