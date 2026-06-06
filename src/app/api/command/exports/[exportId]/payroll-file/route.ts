// FLOSTRUCTION /command — payroll-file artefact streamer (M4-K).
// GET /api/command/exports/[exportId]/payroll-file
//
// Streams the stored payroll-import file for a specific export.
// Auth: caller must be an admin of the export's company. Storage
// path + MIME live on the exports row (M4-E widening). The bytes
// live in the flos-exports-private bucket.
//
// Replaces the legacy client-side CSV synthesis from /command/evidence,
// which had two problems: it bypassed the canonical pack manifest
// (so its bytes did not match payroll_file_hash on export_packs) and
// it sent raw text with no canonical MIME or filename hygiene.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireCompanyMembership } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { routeLogger } from '@/lib/logger';

const STORAGE_BUCKET_PAYROLL = 'flos-exports-private';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ exportId: string }> },
): Promise<Response> {
  const log = routeLogger('GET /api/command/exports/:exportId/payroll-file', null);
  const { exportId } = await params;

  if (!/^[0-9a-fA-F-]{36}$/.test(exportId)) {
    return NextResponse.json({ error: 'invalid_export_id' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Resolve the export + its company in one read.
  const { data: exportRow, error: exportErr } = await supabase
    .from('exports')
    .select(
      'id, company_id, payroll_file_storage_path, payroll_file_mime, ' +
      'pay_period_start, pay_period_end, export_target',
    )
    .eq('id', exportId)
    .maybeSingle();

  if (exportErr || !exportRow) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const row = exportRow as {
    id: string;
    company_id: string;
    payroll_file_storage_path: string | null;
    payroll_file_mime: string | null;
    pay_period_start: string;
    pay_period_end: string;
    export_target: string;
  };

  try {
    await requireCompanyMembership(log, row.company_id);
  } catch (authErr) {
    return authErrorResponse(authErr);
  }

  if (!row.payroll_file_storage_path) {
    // Legacy export rows (the 2 historical exports pre-M4-E) carry
    // no storage path. Surface a clear 404 + reason rather than a
    // generic miss.
    return NextResponse.json(
      {
        error: 'legacy_export_no_artefact',
        message: 'This export pre-dates artefact storage (M4-E). Re-run the export from this period to generate the file.',
      },
      { status: 404 },
    );
  }

  const { data: blob, error: dlErr } = await supabase.storage
    .from(STORAGE_BUCKET_PAYROLL)
    .download(row.payroll_file_storage_path);
  if (dlErr || !blob) {
    return NextResponse.json(
      { error: `download_failed: ${dlErr?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  const mime = row.payroll_file_mime
    ?? 'application/octet-stream';
  const ext = mime.includes('spreadsheetml') ? 'xlsx'
    : mime.startsWith('text/csv')           ? 'csv'
    : 'bin';
  const filename =
    `flostruction-payroll-${row.export_target}-${row.pay_period_start}-to-${row.pay_period_end}.${ext}`;

  const arrayBuf = await blob.arrayBuffer();
  return new Response(arrayBuf, {
    status: 200,
    headers: {
      'content-type': mime,
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
