// Supervisor list endpoint. SELECT and ORDER use created_at per canonical
// pattern matching workers/sites/companies routes.
//
// Bug history: until 2026-05-01 the supervisors table was missing the
// created_at column. Stage 1 fix at 4f97f6a omitted the column and ordered
// by name; migration 202605010945_supervisors_add_created_at.sql added the
// column on 2026-05-01 at 1:26pm AEST; this Stage 2 commit reverts the
// route to the canonical pattern.
//
// Schema-drift guard test at route.test.ts pins the SELECT clause against
// actual production columns and catches future regressions at commit time.
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
    .select('id, name, phone, email, is_active, verify_token, site_ids, supabase_user_id, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

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
