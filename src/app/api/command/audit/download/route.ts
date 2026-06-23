// Flostruction Command — Audit Pack Download (HTML)
// GET /api/command/audit/download?periodStart=&periodEnd=
// Returns a self-contained HTML audit report for download.
// Day 5 P1.2 — companyId derived server-side (was client-supplied).

import { NextResponse } from 'next/server';
import { generateAuditPack } from '@/lib/audit/generate-audit-pack';
import { renderAuditHtml } from '@/lib/audit/render-html';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { logAdminAction } from '@/lib/audit/admin-access-log';

import { routeLogger } from '@/lib/logger';
export async function GET(request: Request) {
  const log = routeLogger('GET /api/command/audit/download', request.headers.get('x-request-id'));
  log.info({ method: 'GET' }, 'request.received');

  let companyId: string;
  let userId: string;
  try {
    ({ companyId, userId } = await getCompanyIdForSession(log));
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

    // SEC-4 — trace every company-wide audit-pack export in admin_access_log
    // (best-effort; logAdminAction swallows its own insert errors).
    await logAdminAction(log, {
      adminUserId: userId,
      companyId,
      resourceType: 'company',
      resourceId: companyId,
      action: 'export',
      reasonCode: `audit_pack_download ${periodStart}..${periodEnd}`,
      request,
    });

    const html = renderAuditHtml(auditPack);
    const fileName = `Flostruction_Audit_${periodStart}_to_${periodEnd}.html`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
