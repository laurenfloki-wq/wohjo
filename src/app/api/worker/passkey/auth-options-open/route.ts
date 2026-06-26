// Phase A (WORKER_PASSKEY_ACCESS) — POST /api/worker/passkey/auth-options-open
// App-open (pre-session) discoverable authentication options. No worker
// identity required — the authenticator presents a resident passkey and the
// worker is resolved from the assertion at verify. The server-issued challenge
// is stored in a signed HttpOnly cookie for the verify step. Live only when the
// flag is on AND WORKER_SESSION_SECRET is set; otherwise 404 → SMS floor.
// Every response carries the SMS fallback. Auth-only.

import { NextResponse } from 'next/server';
import { routeLogger } from '@/lib/logger';
import { workerPasskeyLoginEnabled, setOpenChallengeCookie } from '@/lib/auth/worker-session';
import { openAuthOptions } from '@/lib/auth/worker-passkey-ceremony';

export async function POST(request: Request) {
  const log = routeLogger(
    'POST /api/worker/passkey/auth-options-open',
    request.headers.get('x-request-id'),
  );
  if (!workerPasskeyLoginEnabled()) {
    return NextResponse.json({ error: 'NOT_ENABLED', fallback: 'sms' }, { status: 404 });
  }
  try {
    const options = await openAuthOptions();
    await setOpenChallengeCookie(options.challenge, Date.now());
    return NextResponse.json({ options, fallback: 'sms' });
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : 'unknown' },
      'passkey.auth_options_open.failed',
    );
    return NextResponse.json({ error: 'INTERNAL', fallback: 'sms' }, { status: 500 });
  }
}
