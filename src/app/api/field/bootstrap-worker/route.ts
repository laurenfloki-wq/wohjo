// Flostruction Field — Worker Bootstrap Route
// POST /api/field/bootstrap-worker
//
// Links the authenticated auth.users row to the matching workers row
// via phone number on first OTP sign-in. Solves the gap flagged in
// the Day-6 forensics brief: workers.user_id is nullable and there
// was no route that populated it after first OTP.
//
// Called once from /field/page.tsx after verifyOtp succeeds, before
// /api/field/worker is called. If the link already exists, this is
// a no-op (idempotent).

import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { routeLogger } from '@/lib/logger';
// L2.1 chunk 2 — sign-in anomaly observer. Runs after the worker
// has been linked (or already-linked confirmed). Purely observational —
// never throws, never gates the bootstrap response.
import { observeWorkerSignIn } from '@/lib/auth/worker-signin-anomaly';

export async function POST(request: Request) {
  const log = routeLogger(
    'POST /api/field/bootstrap-worker',
    request.headers.get('x-request-id'),
  );
  log.info({ method: 'POST' }, 'request.received');

  // Read authenticated user via the cookie-bound SSR client.
  const userClient = await createClient();
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) {
    log.warn({ err: userErr?.message }, 'field.bootstrap.no_session');
    return NextResponse.json(
      { error: 'Not signed in', code: 'UNAUTHENTICATED' },
      { status: 401 },
    );
  }

  const user = userRes.user;
  const userPhone = user.phone;

  if (!userPhone) {
    log.warn({ userId: user.id }, 'field.bootstrap.no_phone_on_session');
    return NextResponse.json(
      { error: 'Session has no phone number.', code: 'NO_PHONE' },
      { status: 400 },
    );
  }

  // Supabase stores auth.users.phone as the E.164 number WITHOUT the
  // leading '+' (e.g. "61451258610"). Our workers.phone stores WITH
  // the '+' (e.g. "+61451258610"). Normalise both sides to compare.
  const normalisedPhone = userPhone.startsWith('+') ? userPhone : `+${userPhone}`;

  const service = createServiceClient();

  // Look up any workers row matching this phone.
  const { data: worker, error: lookupErr } = await service
    .from('workers')
    .select('id, user_id, is_active, phone')
    .eq('phone', normalisedPhone)
    .eq('is_active', true)
    .maybeSingle();

  if (lookupErr) {
    log.error(
      { err: lookupErr.message, phone: normalisedPhone },
      'field.bootstrap.lookup_failed',
    );
    return NextResponse.json(
      { error: 'Worker lookup failed', code: 'LOOKUP_FAILED' },
      { status: 500 },
    );
  }

  if (!worker) {
    // Authenticated user with no matching active worker row. This is
    // a real situation — e.g. a former worker whose record was soft-
    // deleted, or someone who signed in with an unrecognised phone.
    log.warn(
      { userId: user.id, phone: normalisedPhone },
      'field.bootstrap.no_worker_match',
    );
    return NextResponse.json(
      {
        error:
          "We couldn't find a worker record for your phone number. If you believe this is a mistake, contact your supervisor.",
        code: 'NO_WORKER_MATCH',
      },
      { status: 404 },
    );
  }

  // Idempotent: if already linked to this user, return early with
  // the existing state. If linked to a DIFFERENT user, that's a
  // conflict — refuse to overwrite without manual review.
  if (worker.user_id === user.id) {
    log.info({ workerId: worker.id, userId: user.id }, 'field.bootstrap.already_linked');
    // L2.1 chunk 2 — observe this sign-in for anomaly flags.
    // Wrapped to never bubble; the helper itself is fail-soft, but
    // an unexpected throw at module load shouldn't break sign-in.
    try {
      await observeSignIn(request, log, worker.id, normalisedPhone);
    } catch (e) {
      log.warn(
        { err: e instanceof Error ? e.message : 'unknown', workerId: worker.id },
        'field.bootstrap.observe_signin_unexpected',
      );
    }
    return NextResponse.json({
      worker_id: worker.id,
      user_id: user.id,
      linked: true,
      already_linked: true,
    });
  }

  if (worker.user_id && worker.user_id !== user.id) {
    log.error(
      {
        workerId: worker.id,
        existingUserId: worker.user_id,
        sessionUserId: user.id,
      },
      'field.bootstrap.conflicting_user_id',
    );
    return NextResponse.json(
      {
        error:
          'This phone number is already linked to a different account. Please contact support@flosmosis.com.',
        code: 'CONFLICTING_USER_ID',
      },
      { status: 409 },
    );
  }

  // Link the worker row to this user. UPDATE guarded on user_id IS
  // NULL so two simultaneous bootstrap calls can't race.
  const { data: updated, error: updateErr } = await service
    .from('workers')
    .update({ user_id: user.id })
    .eq('id', worker.id)
    .is('user_id', null)
    .select('id, user_id')
    .single();

  if (updateErr || !updated) {
    log.error(
      { err: updateErr?.message, workerId: worker.id, userId: user.id },
      'field.bootstrap.link_failed',
    );
    return NextResponse.json(
      {
        error: 'Could not link your account. Please try again in a moment.',
        code: 'LINK_FAILED',
      },
      { status: 500 },
    );
  }

  log.info({ workerId: worker.id, userId: user.id }, 'field.bootstrap.linked');
  // L2.1 chunk 2 — observe this sign-in for anomaly flags. First
  // sign-in for a freshly-linked worker will always raise
  // NEW_DEVICE_SIGN_IN; that's expected and informational, not a
  // problem.
  try {
    await observeSignIn(request, log, worker.id, normalisedPhone);
  } catch (e) {
    log.warn(
      { err: e instanceof Error ? e.message : 'unknown', workerId: worker.id },
      'field.bootstrap.observe_signin_unexpected',
    );
  }
  return NextResponse.json({
    worker_id: worker.id,
    user_id: user.id,
    linked: true,
    already_linked: false,
  });
}

// ─── L2.1 chunk 2 helper ────────────────────────────────────────────
// Bridge between the route's request context and the
// observeWorkerSignIn implementation. Pulls the worker's company_id
// + first_name from the workers table (separate from the route's
// pre-link lookup so we don't conflate concerns), reads Vercel's
// edge geolocation headers, and hands off to the observer.
async function observeSignIn(
  request: Request,
  log: ReturnType<typeof routeLogger>,
  workerId: string,
  _phone: string,
): Promise<void> {
  const service = createServiceClient();
  const { data: full } = await service
    .from('workers')
    .select('id, company_id, first_name')
    .eq('id', workerId)
    .maybeSingle();
  const ipLatHeader = request.headers.get('x-vercel-ip-latitude');
  const ipLngHeader = request.headers.get('x-vercel-ip-longitude');
  await observeWorkerSignIn(log, {
    workerId,
    workerFirstName: (full as { first_name?: string | null } | null)?.first_name ?? null,
    companyId: (full as { company_id?: string | null } | null)?.company_id ?? null,
    userAgent: request.headers.get('user-agent'),
    acceptLanguage: request.headers.get('accept-language'),
    ipAddress:
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    ipCountry:
      request.headers.get('x-vercel-ip-country') ??
      request.headers.get('cf-ipcountry') ??
      null,
    ipCity: request.headers.get('x-vercel-ip-city') ?? null,
    ipLat: ipLatHeader ? Number(ipLatHeader) : null,
    ipLng: ipLngHeader ? Number(ipLngHeader) : null,
    signedInAt: new Date(),
  });
}
