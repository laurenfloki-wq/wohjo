// Phase A (WORKER_PASSKEY_ACCESS) — /api/worker/passkey/credentials
//   GET    → list this worker's enrolled devices (the "your devices" view)
//   DELETE → revoke (hard-DELETE) one device by row id, scoped to the worker
// Flag-gated; every response carries the SMS fallback. Auth-only: never touches
// the sealed event ledger or the WLES chain. Removing the last device leaves the
// worker on the permanent SMS floor — no dead-end.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { routeLogger } from '@/lib/logger';
import { requireWorkerIdentity } from '@/lib/auth/session';
import { AuthorizationError } from '@/lib/auth/errors';
import {
  workerPasskeyAccessEnabled,
  listWorkerCredentials,
  revokeCredential,
} from '@/lib/auth/worker-passkey';

export async function GET(request: Request) {
  const log = routeLogger(
    'GET /api/worker/passkey/credentials',
    request.headers.get('x-request-id'),
  );
  if (!workerPasskeyAccessEnabled()) {
    return NextResponse.json({ error: 'NOT_ENABLED', fallback: 'sms' }, { status: 404 });
  }
  try {
    const identity = await requireWorkerIdentity(log);
    const credentials = await listWorkerCredentials(identity.workerId);
    return NextResponse.json({ credentials, fallback: 'sms' });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.code, fallback: 'sms' }, { status: err.status });
    }
    log.error(
      { err: err instanceof Error ? err.message : 'unknown' },
      'passkey.credentials.list_failed',
    );
    return NextResponse.json({ error: 'INTERNAL', fallback: 'sms' }, { status: 500 });
  }
}

const DeleteSchema = z.object({ id: z.string().uuid() });

export async function DELETE(request: Request) {
  const log = routeLogger(
    'DELETE /api/worker/passkey/credentials',
    request.headers.get('x-request-id'),
  );
  if (!workerPasskeyAccessEnabled()) {
    return NextResponse.json({ error: 'NOT_ENABLED', fallback: 'sms' }, { status: 404 });
  }
  try {
    const identity = await requireWorkerIdentity(log);
    const body = (await request.json().catch(() => null)) as unknown;
    const parsed = DeleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'INVALID_BODY', fallback: 'sms' }, { status: 400 });
    }
    const removed = await revokeCredential(identity.workerId, parsed.data.id);
    if (removed === 0) {
      // Not found or not this worker's — do not leak which.
      return NextResponse.json({ error: 'NOT_FOUND', fallback: 'sms' }, { status: 404 });
    }
    log.info(
      { workerId: identity.workerId, credentialRowId: parsed.data.id },
      'passkey.credentials.revoked',
    );
    return NextResponse.json({ ok: true, fallback: 'sms' });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.code, fallback: 'sms' }, { status: err.status });
    }
    log.error(
      { err: err instanceof Error ? err.message : 'unknown' },
      'passkey.credentials.revoke_failed',
    );
    return NextResponse.json({ error: 'INTERNAL', fallback: 'sms' }, { status: 500 });
  }
}
