// GET /api/command/payruns/[exportId]/evidence — regenerated pack download.
// PDF by default (with a verify QR); ?format=html for the preview; HTML
// fallback when a legacy export has no file_hash (no verify token).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
const { getExportMock, repoMock } = vi.hoisted(() => {
  const getExportMock = vi.fn();
  const repoMock = vi.fn(() => ({ getExportById: getExportMock }));
  return { getExportMock, repoMock };
});
const { genPackMock, renderHtmlMock, renderPdfMock, qrMock, logActionMock } = vi.hoisted(() => ({
  genPackMock: vi.fn(),
  renderHtmlMock: vi.fn(),
  renderPdfMock: vi.fn(),
  qrMock: vi.fn(),
  logActionMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ getCompanyIdForSession: getSessionMock }));
vi.mock('@/lib/db/repositories/page.repo', () => ({ payRunsRepo: repoMock }));
vi.mock('@/lib/audit/generate-audit-pack', () => ({ generateAuditPack: genPackMock }));
vi.mock('@/lib/audit/render-html', () => ({ renderAuditHtml: renderHtmlMock }));
vi.mock('@/lib/audit/render-pdf', () => ({ renderAuditPdf: renderPdfMock }));
vi.mock('@/lib/audit/qr', () => ({ qrPng: qrMock }));
vi.mock('@/lib/audit/admin-access-log', () => ({ logAdminAction: logActionMock }));
vi.mock('@/lib/logger', () => ({
  routeLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/lib/auth/response', () => ({
  authErrorResponse: (err: { status?: number; code?: string }) =>
    new Response(JSON.stringify({ error: err.code ?? 'AUTH' }), { status: err.status ?? 401 }),
}));

import { GET } from './route';

const COMPANY = '00000000-1000-4000-8000-000000000001';
const USER = '00000000-1000-4000-8000-0000000000aa';
const EXPORT = '55555555-5555-4555-8555-555555555555';
const FILE_HASH = 'b3569353caaff84f9150c83c8dafc14de54e14989a9e159f56d0b0bf01f39aea';

const ctx = { params: Promise.resolve({ exportId: EXPORT }) };
const req = (qs = '') => new Request(`http://test/api/command/payruns/${EXPORT}/evidence${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ companyId: COMPANY, userId: USER });
  getExportMock.mockResolvedValue({
    data: {
      id: EXPORT,
      pay_period_start: '2026-06-08',
      pay_period_end: '2026-06-14',
      exported_at: '2026-06-15T00:00:00.000Z',
      file_hash: FILE_HASH,
      export_target: 'employment_hero',
    },
    error: null,
  });
  genPackMock.mockResolvedValue({ hash_chain_integrity: 'VERIFIED' });
  renderHtmlMock.mockReturnValue('<!doctype html><title>pack</title>');
  renderPdfMock.mockResolvedValue(Buffer.from('%PDF-1.7 fake'));
  qrMock.mockResolvedValue(Buffer.from('png'));
});

describe('GET evidence', () => {
  it('404 when the run is not in this company', async () => {
    getExportMock.mockResolvedValue({ data: null, error: null });
    const res = await GET(req(), ctx);
    expect(res.status).toBe(404);
    expect(genPackMock).not.toHaveBeenCalled();
  });

  it('returns a PDF by default, with the period derived server-side', async () => {
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('EvidencePack');
    expect(res.headers.get('content-disposition')).toContain('.pdf');
    expect(renderPdfMock).toHaveBeenCalled();
    // The verify URL passed to the PDF is anchored to the sealed file_hash.
    const pdfArg = renderPdfMock.mock.calls[0]?.[0] as { url: string };
    expect(pdfArg.url).toContain(`/verify/${FILE_HASH}`);
    const arg = genPackMock.mock.calls[0]?.[0] as { periodStart: string; periodEnd: string };
    expect(arg.periodStart).toBe('2026-06-08');
    expect(arg.periodEnd).toBe('2026-06-14');
  });

  it('serves HTML when ?format=html', async () => {
    const res = await GET(req('?format=html'), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('content-disposition')).toContain('.html');
    expect(renderHtmlMock).toHaveBeenCalled();
    expect(renderPdfMock).not.toHaveBeenCalled();
  });

  it('falls back to HTML for a legacy export with no file_hash', async () => {
    getExportMock.mockResolvedValue({
      data: {
        id: EXPORT,
        pay_period_start: '2026-06-08',
        pay_period_end: '2026-06-14',
        exported_at: '2026-06-15T00:00:00.000Z',
        file_hash: null,
        export_target: null,
      },
      error: null,
    });
    const res = await GET(req(), ctx);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(renderPdfMock).not.toHaveBeenCalled();
  });

  it('422 when the run has no resolvable period', async () => {
    getExportMock.mockResolvedValue({
      data: {
        id: EXPORT,
        pay_period_start: null,
        pay_period_end: null,
        exported_at: null,
        file_hash: FILE_HASH,
      },
      error: null,
    });
    const res = await GET(req(), ctx);
    expect(res.status).toBe(422);
  });

  it('records an immutable export audit line', async () => {
    await GET(req(), ctx);
    const audit = logActionMock.mock.calls[0]?.[1] as { action: string; resourceType: string };
    expect(audit.action).toBe('export');
    expect(audit.resourceType).toBe('export');
  });
});
