// Public hours verification — GET /verify/[token]
//
// One capability URL, two audiences (the QR on the Evidence Pack and
// the payroll system that imported the CSV both point here):
//   • browser / QR scan            → a self-contained "Verified" page
//   • Accept: application/json      → machine-readable hours + chain
//     status, for a payroll system to confirm what it is about to pay
//
// No login: authority is the token (the export's file_hash). The verdict
// is computed by re-running the spec-aware hash-chain check against the
// live ledger at request time — never a claim the document makes about
// itself. Read-only; never mutates. Unknown token → 404 (itself a signal
// the document was altered or never issued).

import { NextResponse } from 'next/server';
import { verifyPackByToken } from '@/lib/audit/verify-pack';
import { toVerifyJson } from '@/lib/audit/verify-result';
import { renderVerifyPage, renderVerifyNotFound } from '@/lib/audit/render-verify-page';
import { verifyUrl } from '@/lib/audit/verify-url';
import { qrSvg } from '@/lib/audit/qr';
import { routeLogger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function wantsJson(request: Request, format: string | null): boolean {
  if (format === 'json') return true;
  if (format === 'html') return false;
  const accept = request.headers.get('accept') ?? '';
  return accept.includes('application/json') && !accept.includes('text/html');
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const log = routeLogger('GET /verify/:token', request.headers.get('x-request-id'));
  const { token } = await params;
  const format = new URL(request.url).searchParams.get('format');
  const json = wantsJson(request, format);

  let result;
  try {
    result = await verifyPackByToken(token);
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : 'unknown' }, 'verify.lookup_failed');
    if (json) return NextResponse.json({ error: 'verification_unavailable' }, { status: 500 });
    return new NextResponse('Verification temporarily unavailable.', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  if (!result.found || !result.meta || !result.pack) {
    if (json) {
      return NextResponse.json(
        { wles_verification: '1', status: 'NOT_FOUND', found: false },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return new NextResponse(renderVerifyNotFound(), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const url = verifyUrl(result.meta.fileHash);

  if (json) {
    return NextResponse.json(toVerifyJson(result.meta, result.pack, url), {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const svg = await qrSvg(url);
  const html = renderVerifyPage({ meta: result.meta, pack: result.pack, url, qrSvg: svg });
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
