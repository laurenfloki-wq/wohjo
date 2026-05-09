// CRACK 205 — role detection for the /field sign-in page.
// GET /api/field/role-detect
//
// Called after Supabase OTP verification to determine whether the
// authenticated user is a worker (→ /field/home) or an admin
// (→ /command/dashboard), before any further bootstrapping.
//
// Lookup order:
//   1. workers.user_id = auth.uid() AND is_active = true
//      (already-linked worker on second+ sign-in)
//   2. workers.phone = normalised(auth.users.phone) AND is_active = true
//      (first-time worker whose user_id hasn't been linked yet)
//   3. admins.user_id = auth.uid()
//      (admin signing in via the field OTP page)
//
// Responses:
//   200 { role: 'worker' } — proceed to bootstrap-worker, then /field/home
//   200 { role: 'admin'  } — skip bootstrap, redirect to /command/dashboard
//   404 { code: 'NO_IDENTITY' } — no matching record in either table
//   401 if no session

import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { routeLogger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const log = routeLogger(
    'GET /api/field/role-detect',
    request.headers.get('x-request-id'),
  );

  const userClient = await createClient();
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) {
    log.warn({ err: userErr?.message }, 'field.role_detect.no_session');
    return NextResponse.json({ error: 'Not signed in', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const user = userRes.user;
  const service = createServiceClient();

  // 1. Workers — match by user_id (already-linked).
  const { data: workerById, error: workerByIdErr } = await service
    .from('workers')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (workerByIdErr) {
    log.error({ err: workerByIdErr.message, userId: user.id }, 'field.role_detect.workers_lookup_failed');
    return NextResponse.json({ error: 'Lookup failed', code: 'LOOKUP_FAILED' }, { status: 500 });
  }

  if (workerById) {
    log.info({ userId: user.id, workerId: (workerById as { id: string }).id }, 'field.role_detect.worker_by_uid');
    return NextResponse.json({ role: 'worker' });
  }

  // 2. Workers — match by phone (first-time sign-in, user_id not yet linked).
  const rawPhone = user.phone;
  if (rawPhone) {
    const normalisedPhone = rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`;
    const { data: workerByPhone, error: workerByPhoneErr } = await service
      .from('workers')
      .select('id')
      .eq('phone', normalisedPhone)
      .eq('is_active', true)
      .maybeSingle();

    if (workerByPhoneErr) {
      log.error({ err: workerByPhoneErr.message, userId: user.id }, 'field.role_detect.workers_phone_lookup_failed');
      return NextResponse.json({ error: 'Lookup failed', code: 'LOOKUP_FAILED' }, { status: 500 });
    }

    if (workerByPhone) {
      log.info({ userId: user.id, workerId: (workerByPhone as { id: string }).id }, 'field.role_detect.worker_by_phone');
      return NextResponse.json({ role: 'worker' });
    }
  }

  // 3. Admins — match by user_id.
  const { data: admin, error: adminErr } = await service
    .from('admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (adminErr) {
    log.error({ err: adminErr.message, userId: user.id }, 'field.role_detect.admins_lookup_failed');
    return NextResponse.json({ error: 'Lookup failed', code: 'LOOKUP_FAILED' }, { status: 500 });
  }

  if (admin) {
    log.info({ userId: user.id }, 'field.role_detect.admin');
    return NextResponse.json({ role: 'admin' });
  }

  log.warn({ userId: user.id, phone: rawPhone }, 'field.role_detect.no_identity');
  return NextResponse.json(
    { error: 'No active worker or admin record found for this account.', code: 'NO_IDENTITY' },
    { status: 404 },
  );
}
