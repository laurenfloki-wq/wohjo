// Phase A (WORKER_PASSKEY_ACCESS) — POST /api/worker/passkey/auth-verify
// Verifies the assertion and, on success, issues the APP_ACCESS worker_mfa_grants
// grant (same TTL + device_binding the SMS path uses). Flag-gated. On ANY failure
// the worker is routed to the SMS fallback (never locked out).

import { NextResponse } from 'next/server';
import { routeLogger } from '@/lib/logger';
import { requireWorkerIdentity } from '@/lib/auth/session';
import { AuthorizationError } from '@/lib/auth/errors';
import { deviceBindingFromUserAgent } from '@/lib/auth/worker-mfa';
import { workerPasskeyAccessEnabled } from '@/lib/auth/worker-passkey';
import { authVerify } from '@/lib/auth/worker-passkey-ceremony';

export async function POST(request: Request) {
  const log = routeLogger(
    'POST /api/worker/passkey/auth-verify',
    request.headers.get('x-request-id'),
  );
  if (!workerPasskeyAccessEnabled()) {
    return NextResponse.json({ error: 'NOT_ENABLED', fallback: 'sms' }, { status: 404 });
  }
  try {
    const identity = await requireWorkerIdentity(log);
    const body = (await request.json().catch(() => null)) as { response?: unknown } | null;
    if (!body?.response) {
      return NextResponse.json({ error: 'INVALID_BODY', fallback: 'sms' }, { status: 400 });
    }
    const deviceBinding = deviceBindingFromUserAgent(request.headers.get('user-agent'));
    const { verified } = await authVerify(
      identity.workerId,
      body.response as Parameters<typeof authVerify>[1],
      deviceBinding,
    );
    if (!verified) {
      // Not an error the worker should be stuck on — send them to SMS.
      return NextResponse.json({ error: 'ASSERTION_FAILED', fallback: 'sms' }, { status: 401 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.code, fallback: 'sms' }, { status: err.status });
    }
    log.error(
      { err: err instanceof Error ? err.message : 'unknown' },
      'passkey.auth_verify.failed',
    );
    return NextResponse.json({ error: 'INTERNAL', fallback: 'sms' }, { status: 500 });
  }
}
