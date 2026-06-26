// Phase A (WORKER_PASSKEY_ACCESS) — POST /api/worker/passkey/auth-verify-open
// App-open (pre-session) passkey login. Verifies the discoverable assertion
// against the cookie-held challenge, resolves + re-validates the worker, and on
// success mints a self-issued worker-session cookie (the chokepoint accepts it).
// ANY failure → no session, { fallback: 'sms' } → the worker uses the SMS floor;
// never a dead-end. The challenge cookie is single-use (cleared every call).
// Live only when the flag is on AND WORKER_SESSION_SECRET is set. Auth-only:
// never touches the sealed event ledger or the WLES chain.

import { NextResponse } from 'next/server';
import { routeLogger } from '@/lib/logger';
import { deviceBindingFromUserAgent } from '@/lib/auth/worker-mfa';
import {
  workerPasskeyLoginEnabled,
  readOpenChallengeCookie,
  clearOpenChallengeCookie,
  setWorkerSessionCookie,
} from '@/lib/auth/worker-session';
import { openAuthVerify } from '@/lib/auth/worker-passkey-ceremony';

export async function POST(request: Request) {
  const log = routeLogger(
    'POST /api/worker/passkey/auth-verify-open',
    request.headers.get('x-request-id'),
  );
  if (!workerPasskeyLoginEnabled()) {
    return NextResponse.json({ error: 'NOT_ENABLED', fallback: 'sms' }, { status: 404 });
  }
  try {
    const body = (await request.json().catch(() => null)) as { response?: unknown } | null;
    if (!body?.response) {
      return NextResponse.json({ error: 'INVALID_BODY', fallback: 'sms' }, { status: 400 });
    }
    const challenge = await readOpenChallengeCookie(Date.now());
    if (!challenge) {
      // No / expired challenge — the worker simply restarts on the SMS floor.
      return NextResponse.json({ error: 'NO_CHALLENGE', fallback: 'sms' }, { status: 401 });
    }
    const deviceBinding = deviceBindingFromUserAgent(request.headers.get('user-agent'));
    const result = await openAuthVerify(
      body.response as Parameters<typeof openAuthVerify>[0],
      challenge,
      deviceBinding,
    );
    // Single-use: drop the challenge regardless of outcome.
    await clearOpenChallengeCookie();
    if (!result.verified || !result.userId || !result.workerId) {
      return NextResponse.json({ error: 'ASSERTION_FAILED', fallback: 'sms' }, { status: 401 });
    }
    await setWorkerSessionCookie({ uid: result.userId, wid: result.workerId }, Date.now());
    log.info({ workerId: result.workerId }, 'passkey.auth_verify_open.session_minted');
    return NextResponse.json({ ok: true, fallback: 'sms' });
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : 'unknown' },
      'passkey.auth_verify_open.failed',
    );
    return NextResponse.json({ error: 'INTERNAL', fallback: 'sms' }, { status: 500 });
  }
}
