// Pay-run payroll file download.
// GET /api/command/payruns/[exportId]/payroll
//
// Re-derives the Employment Hero payroll CSV for a kept run from its
// sealed shift ids (the bytes are never stored — genesis `exports` keeps
// only metadata + file_hash), then returns it as an attachment. The
// recomputed sha-256 is returned in a header so the caller can confirm it
// matches the file_hash recorded at run time. Read-only: it never mutates
// the run. The access is recorded as an immutable `export` audit line.
//
// Downstream (payroll) verification: the CSV body is kept BARE so the
// file's sha-256 still matches the sealed file_hash and no comment lines
// can break the payroll importer. The verify handle rides in headers
// instead — `X-Verify-URL` (and is derivable from `X-Payroll-File-Hash`):
// a payroll integration can GET it with `Accept: application/json` to
// confirm the hours it is about to pay against the live WLES ledger.

import { NextResponse } from 'next/server';
import { payRunsRepo } from '@/lib/db/repositories/page.repo';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { routeLogger } from '@/lib/logger';
import { logAdminAction } from '@/lib/audit/admin-access-log';
import { derivePayrollCsv, sha256Hex, type RunShiftRow } from '@/lib/payruns/run-detail';
import { verifyTokenForExport, verifyUrl } from '@/lib/audit/verify-url';

interface ExportRow {
  id: string;
  pay_period_start: string | null;
  pay_period_end: string | null;
  exported_at: string | null;
  file_hash: string | null;
  shift_ids: string[] | null;
}

function periodTag(exp: ExportRow): string {
  const start =
    exp.pay_period_start ?? (exp.exported_at ? exp.exported_at.slice(0, 10) : 'undated');
  const end = exp.pay_period_end ?? start;
  return start === end ? start : `${start}_to_${end}`;
}

export async function GET(request: Request, { params }: { params: Promise<{ exportId: string }> }) {
  const log = routeLogger(
    'GET /api/command/payruns/:id/payroll',
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

  const ids = run.shift_ids ?? [];
  const { data: shiftRows } = ids.length > 0 ? await repo.shiftsByIds(ids) : { data: [] };
  const csv = derivePayrollCsv((shiftRows ?? []) as unknown as RunShiftRow[]);
  const recomputed = sha256Hex(csv);
  const verified = run.file_hash !== null && run.file_hash === recomputed;

  await logAdminAction(log, {
    adminUserId: userId,
    companyId,
    resourceType: 'export',
    resourceId: exportId,
    action: 'export',
    reasonCode: 'payroll_file_download',
    request,
  });

  const fileName = `Flostruction_PayRun_${periodTag(run)}.csv`;
  const headers: Record<string, string> = {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${fileName}"`,
    'X-Payroll-File-Hash': recomputed,
    'X-Payroll-File-Verified': verified ? 'match' : 'recomputed',
    'Cache-Control': 'no-store',
  };
  // Import-safe verify handle: header only, body stays bare. Anchored to
  // the SEALED file_hash (the ledger token), not the recompute.
  if (run.file_hash) {
    headers['X-Verify-URL'] = verifyUrl(verifyTokenForExport(run.file_hash));
  }
  return new NextResponse(csv, { status: 200, headers });
}
