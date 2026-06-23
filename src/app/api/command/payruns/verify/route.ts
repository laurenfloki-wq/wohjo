// Operator verify lookup — GET /api/command/payruns/verify?q=<receipt|hash|link>
//
// Powers the in-app "Verify a pack" tool. Unlike the public /verify
// endpoint (capability-token = file_hash, for external auditors), this is
// company-scoped to the signed-in operator, so it can accept the HUMAN
// receipt code (FSTR-…) printed on every pack — the intuitive thing an
// operator reaches for — as well as a file hash or verify link.
//
// Either way it resolves to one of the company's exports, re-runs the
// spec-aware hash-chain check live (generateAuditPack), and returns the
// SAME machine contract the public endpoint serves. Read-only.

import { NextResponse } from 'next/server';
import { payRunsRepo } from '@/lib/db/repositories/page.repo';
import { generateAuditPack } from '@/lib/audit/generate-audit-pack';
import { toVerifyJson } from '@/lib/audit/verify-result';
import { classifyVerifyQuery, verifyUrl } from '@/lib/audit/verify-url';
import type { VerifyExportMeta } from '@/lib/audit/verify-pack';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { routeLogger } from '@/lib/logger';

export const runtime = 'nodejs';

interface ExportLookupRow {
  id: string;
  company_id: string;
  export_target: string | null;
  file_hash: string | null;
  pay_period_start: string | null;
  pay_period_end: string | null;
  exported_at: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NOT_FOUND = { wles_verification: '1', status: 'NOT_FOUND', found: false } as const;

export async function GET(request: Request) {
  const log = routeLogger('GET /api/command/payruns/verify', request.headers.get('x-request-id'));

  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const q = new URL(request.url).searchParams.get('q') ?? '';
  const classified = classifyVerifyQuery(q);
  if (!classified) {
    return NextResponse.json(
      { wles_verification: '1', status: 'INVALID', found: false },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const repo = payRunsRepo(companyId);

  // Resolve the query to one of this company's exports.
  let row: ExportLookupRow | null = null;
  if (classified.kind === 'hash') {
    const { data } = await repo.exportByFileHash(classified.value);
    row = (data as ExportLookupRow | null) ?? null;
  } else {
    const { data: shift } = await repo.shiftIdByReceipt(classified.value);
    const shiftId = (shift as { id: string } | null)?.id;
    if (shiftId) {
      const { data } = await repo.exportContainingShift(shiftId);
      row = (data as ExportLookupRow | null) ?? null;
    }
  }

  if (!row || !row.file_hash) {
    return NextResponse.json(NOT_FOUND, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  const fallback = row.exported_at ? row.exported_at.slice(0, 10) : null;
  const periodStart = row.pay_period_start ?? fallback;
  const periodEnd = row.pay_period_end ?? periodStart;
  if (!periodStart || !periodEnd || !DATE_RE.test(periodStart) || !DATE_RE.test(periodEnd)) {
    return NextResponse.json(NOT_FOUND, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const pack = await generateAuditPack({ companyId, periodStart, periodEnd });
    const meta: VerifyExportMeta = {
      exportId: row.id,
      companyId,
      provider: row.export_target,
      fileHash: row.file_hash,
      payPeriodStart: periodStart,
      payPeriodEnd: periodEnd,
      exportedAt: row.exported_at,
    };
    return NextResponse.json(toVerifyJson(meta, pack, verifyUrl(row.file_hash)), {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : 'unknown' }, 'payruns.verify.failed');
    return NextResponse.json({ error: 'verification_unavailable' }, { status: 500 });
  }
}
