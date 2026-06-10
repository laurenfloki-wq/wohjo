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
// W1.4 (2026-06-10): company-scoped repository replaces the raw client;
// the schema-drift guard pins the SELECT clause in the repo.
import { supervisorsRepo } from '@/lib/db/repositories/supervisors.repo';
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

  const repo = supervisorsRepo(companyId);
  const { data: supervisors, error } = await repo.list();

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

  const repo = supervisorsRepo(companyId);

  // Check duplicate phone within this company only.
  const { data: existing } = await repo.findIdByPhone(body.phone);
  if (existing) {
    return NextResponse.json({ error: 'A supervisor with this phone number already exists' }, { status: 409 });
  }

  const { data: supervisor, error } = await repo.create({
      name: body.name,
      phone: body.phone,
      email: body.email || null,
      is_active: true,
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ supervisor }, { status: 201 });
}
