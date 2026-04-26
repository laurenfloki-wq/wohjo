// Flostruction Command — Audit Pack (JSON)
// GET /api/command/audit?periodStart=&periodEnd=
// Returns the full audit pack as JSON for the session admin's company.
// Day 5 P1.2 — companyId derived server-side (was client-supplied).

import { NextResponse } from 'next/server';
import { generateAuditPack } from '@/lib/audit/generate-audit-pack';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';

import { routeLogger } from '@/lib/logger';
export async function GET(request: Request) {
  const log = routeLogger('GET /api/command/audit', request.headers.get('x-request-id'));
  log.info({ method: 'GET' }, 'request.received');

  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  try {
    const { searchParams } = new URL(request.url);
    const periodStart = searchParams.get('periodStart');
    const periodEnd = searchParams.get('periodEnd');

    if (!periodStart || !periodEnd) {
      return NextResponse.json(
        { error: 'periodStart and periodEnd query params required' },
        { status: 400 }
      );
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(periodStart) || !dateRegex.test(periodEnd)) {
      return NextResponse.json(
        { error: 'periodStart and periodEnd must be YYYY-MM-DD format' },
        { status: 400 }
      );
    }

    const auditPack = await generateAuditPack({
      companyId,
      periodStart,
      periodEnd,
    });

    return NextResponse.json(auditPack);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
