// Day 5 P1.2 — company_id derived server-side (was client-supplied; GAP-A3-001 closure).
//
// 2026-05-01 Friday morning — Lauren's parallel SQL queries surfaced the
// actual root cause of the "0 registered" rendering bug:
//
//   information_schema.columns confirmed supervisors columns:
//     id, company_id, name, phone, email, supabase_user_id, site_ids,
//     is_active, pending_sms_approval_ids, last_batch_sms_date,
//     verify_token
//
//   No created_at column. No updated_at column. workers/sites/companies
//   all have created_at; supervisors does not. Schema drift.
//
// Stage 1 fix (this commit): GET no longer references created_at.
// SELECT is reduced to columns that actually exist + ORDER BY name asc.
// The defensive `dynamic = 'force-dynamic'` + `revalidate = 0` directives
// added on 2026-04-30 evening were cache theatre — the bug was data-shape,
// not caching — and have been removed.
//
// Stage 2 fix (separate commit, ships after Lauren applies the migration
// at migrations/202605010945_supervisors_add_created_at.sql to production):
// route reverts to the canonical SELECT created_at + ORDER created_at desc
// pattern that workers/sites/companies use, so newest-first listing works
// for tenants with many supervisors.
//
// Joao E2E test sacred zone untouched — this route is the /command admin
// surface, not the supervisor SMS approval path.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';

import { routeLogger } from '@/lib/logger';

export async function GET(request: Request) {
  const log = routeLogger('GET /api/command/supervisors', request.headers.get('x-request-id'));
  log.info({ method: 'GET' }, 'request.received');

  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const supabase = createServiceClient();
  const { data: supervisors, error } = await supabase
    .from('supervisors')
    .select('id, name, phone, email, is_active, verify_token, site_ids, supabase_user_id')
    .eq('company_id', companyId)
    .order('name', { ascending: true });

  if (error) {
    log.error({ err: error }, 'supervisors.select.failed');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ supervisors: supervisors ?? [] });
}

export async function POST(request: Request) {
  const log = routeLogger('POST /api/command/supervisors', request.headers.get('x-request-id'));
  log.info({ method: 'POST' }, 'request.received');

  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const body = await request.json() as {
    name: string;
    phone: string;
    email?: string;
  };

  if (!body.name || !body.phone) {
    return NextResponse.json({ error: 'name and phone are required' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Check duplicate phone within this company only.
  const { data: existing } = await supabase
    .from('supervisors')
    .select('id')
    .eq('phone', body.phone)
    .eq('company_id', companyId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'A supervisor with this phone number already exists' }, { status: 409 });
  }

  const { data: supervisor, error } = await supabase
    .from('supervisors')
    .insert({
      name: body.name,
      phone: body.phone,
      email: body.email || null,
      company_id: companyId,
      is_active: true,
    })
    .select('id, name, phone, verify_token')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ supervisor }, { status: 201 });
}
