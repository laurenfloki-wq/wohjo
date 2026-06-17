// Pay-run Evidence Pack download.
// GET /api/command/payruns/[exportId]/evidence            → PDF (default)
// GET /api/command/payruns/[exportId]/evidence?format=html → HTML preview
//
// Regenerates the Evidence Pack for a kept run. The PDF is the official,
// hand-off-able deliverable: it reads as a finished document, survives
// corporate mail filters, archives cleanly, and carries a QR + verify
// URL so a recipient (auditor, host employer, Fair Work) can re-check
// the hours against the live ledger instead of trusting the file. The
// HTML form is kept for in-browser preview.
//
// The period is derived server-side from the sealed `exports` row (never
// user-supplied), and generateAuditPack reads shifts of ANY status in the
// window with full SPEC-AWARE hash-chain verification — so the pack is
// robust to the post-export status transition and carries the same
// mathematics as the payroll file. The access is recorded as an
// immutable `export` audit line.

import { NextResponse } from 'next/server';
import { payRunsRepo } from '@/lib/db/repositories/page.repo';
import { generateAuditPack } from '@/lib/audit/generate-audit-pack';
import { renderAuditHtml } from '@/lib/audit/render-html';
import { renderAuditPdf } from '@/lib/audit/render-pdf';
import { verifyTokenForExport, verifyUrl } from '@/lib/audit/verify-url';
import type { VerifyExportMeta } from '@/lib/audit/verify-pack';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { routeLogger } from '@/lib/logger';
import { logAdminAction } from '@/lib/audit/admin-access-log';

export const runtime = 'nodejs';

interface ExportRow {
  id: string;
  pay_period_start: string | null;
  pay_period_end: string | null;
  exported_at: string | null;
  file_hash: string | null;
  export_target: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request, { params }: { params: Promise<{ exportId: string }> }) {
  const log = routeLogger(
    'GET /api/command/payruns/:id/evidence',
    request.headers.get('x-request-id'),
  );

  let companyId: string;
  let userId: string;
  try {
    ({ companyId, userId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const { exportId } = await params;
  if (!exportId) return NextResponse.json({ error: 'export id is required' }, { status: 400 });

  const repo = payRunsRepo(companyId);
  const { data: exp } = await repo.getExportById(exportId);
  if (!exp) return NextResponse.json({ error: 'Pay run not found' }, { status: 404 });
  const run = exp as unknown as ExportRow;

  const fallback = run.exported_at ? run.exported_at.slice(0, 10) : null;
  const periodStart = run.pay_period_start ?? fallback;
  const periodEnd = run.pay_period_end ?? periodStart;
  if (!periodStart || !periodEnd || !DATE_RE.test(periodStart) || !DATE_RE.test(periodEnd)) {
    return NextResponse.json({ error: 'Pay run has no resolvable period' }, { status: 422 });
  }

  // PDF is the default deliverable; ?format=html serves the preview. A
  // verifiable PDF needs the sealed file_hash (the verify token) — if a
  // legacy export lacks one, fall back to HTML rather than ship a PDF
  // that can't be re-checked.
  const format = new URL(request.url).searchParams.get('format');
  const wantPdf = format !== 'html' && !!run.file_hash;

  let body: Buffer | string;
  let contentType: string;
  let ext: string;
  try {
    const pack = await generateAuditPack({ companyId, periodStart, periodEnd });
    if (wantPdf) {
      const token = verifyTokenForExport(run.file_hash as string);
      const url = verifyUrl(token);
      const meta: VerifyExportMeta = {
        exportId: run.id,
        companyId,
        provider: run.export_target,
        fileHash: run.file_hash as string,
        payPeriodStart: periodStart,
        payPeriodEnd: periodEnd,
        exportedAt: run.exported_at,
      };
      body = await renderAuditPdf({ meta, pack, url });
      contentType = 'application/pdf';
      ext = 'pdf';
    } else {
      body = renderAuditHtml(pack);
      contentType = 'text/html; charset=utf-8';
      ext = 'html';
    }
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : 'unknown' },
      'payruns.evidence.generate_failed',
    );
    return NextResponse.json({ error: 'Failed to generate Evidence Pack' }, { status: 500 });
  }

  await logAdminAction(log, {
    adminUserId: userId,
    companyId,
    resourceType: 'export',
    resourceId: exportId,
    action: 'export',
    reasonCode: 'evidence_pack_download',
    request,
  });

  const tag = periodStart === periodEnd ? periodStart : `${periodStart}_to_${periodEnd}`;
  const fileName = `Flostruction_EvidencePack_${tag}.${ext}`;
  return new NextResponse(body as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
