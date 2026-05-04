// /api/command/worker-card-ids — list workers with their MYOB Card IDs
// + assign/update worker.myob_card_id in bulk.
//
// GET  → returns workers (id, first_name, last_name, employee_id,
//        myob_card_id) for the calling admin's tenant.
// POST → updates one worker.myob_card_id. Body:
//        { worker_id: uuid, myob_card_id: string | null }.
//        Tenant-scoped: rejects worker_ids not belonging to the
//        calling admin's company_id.
//
// Substrate-DD posture: this is a SCOPED write to workers. We do NOT
// modify the existing /api/command/workers route (per Monday brief
// HARD RULE — surgical scope). All other worker fields are
// untouched.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { routeLogger } from '@/lib/logger';

export async function GET(request: Request) {
  const log = routeLogger(
    'GET /api/command/worker-card-ids',
    request.headers.get('x-request-id'),
  );
  log.info({ method: 'GET' }, 'request.received');

  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('workers')
    .select('id, first_name, last_name, employee_id, myob_card_id, is_active')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('last_name', { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ workers: data ?? [] });
}

export async function POST(request: Request) {
  const log = routeLogger(
    'POST /api/command/worker-card-ids',
    request.headers.get('x-request-id'),
  );
  log.info({ method: 'POST' }, 'request.received');

  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  let body: { worker_id?: unknown; myob_card_id?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const workerId =
    typeof body.worker_id === 'string' ? body.worker_id.trim() : '';
  if (!workerId || !/^[0-9a-f-]{36}$/i.test(workerId)) {
    return NextResponse.json(
      { error: 'worker_id (uuid) required' },
      { status: 400 },
    );
  }
  const cardId =
    typeof body.myob_card_id === 'string'
      ? body.myob_card_id.trim()
      : '';
  // Empty string is permitted — clears the card_id back to NULL-ish.
  if (cardId.length > 64) {
    return NextResponse.json(
      { error: 'myob_card_id capped at 64 chars' },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  // Tenant-scoped UPDATE: the .eq('company_id', companyId) predicate
  // rejects cross-tenant attempts. Even if an attacker forged a
  // worker_id from another tenant, this UPDATE matches zero rows.
  const { error } = await supabase
    .from('workers')
    .update({ myob_card_id: cardId.length > 0 ? cardId : null })
    .eq('id', workerId)
    .eq('company_id', companyId);
  if (error) {
    log.error({ err: error.message }, 'worker_card_ids.update_failed');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
