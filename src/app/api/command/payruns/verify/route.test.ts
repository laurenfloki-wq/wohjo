// GET /api/command/payruns/verify — operator verify lookup (receipt or hash).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
const { byHashMock, byReceiptMock, containingMock, repoMock } = vi.hoisted(() => {
  const byHashMock = vi.fn();
  const byReceiptMock = vi.fn();
  const containingMock = vi.fn();
  const repoMock = vi.fn(() => ({
    exportByFileHash: byHashMock,
    shiftIdByReceipt: byReceiptMock,
    exportContainingShift: containingMock,
  }));
  return { byHashMock, byReceiptMock, containingMock, repoMock };
});
const { genPackMock } = vi.hoisted(() => ({ genPackMock: vi.fn() }));

vi.mock('@/lib/auth/session', () => ({ getCompanyIdForSession: getSessionMock }));
vi.mock('@/lib/db/repositories/page.repo', () => ({ payRunsRepo: repoMock }));
vi.mock('@/lib/audit/generate-audit-pack', () => ({ generateAuditPack: genPackMock }));
vi.mock('@/lib/logger', () => ({
  routeLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/lib/auth/response', () => ({
  authErrorResponse: (err: { status?: number }) =>
    new Response(JSON.stringify({ error: 'AUTH' }), { status: err.status ?? 401 }),
}));

import { GET } from './route';

const COMPANY = '00000000-1000-4000-8000-000000000001';
const FILE_HASH = 'b3569353caaff84f9150c83c8dafc14de54e14989a9e159f56d0b0bf01f39aea';
const EXPORT_ROW = {
  id: 'exp-1',
  company_id: COMPANY,
  export_target: 'employment_hero',
  file_hash: FILE_HASH,
  pay_period_start: '2026-06-16',
  pay_period_end: '2026-06-16',
  exported_at: '2026-06-16T02:31:37.000Z',
};
const PACK = {
  generated_at: '2026-06-17T01:31:37.000Z',
  company_id: COMPANY,
  period_start: '2026-06-16',
  period_end: '2026-06-16',
  total_shifts: 1,
  total_events: 3,
  total_hours: 0.37,
  hash_chain_integrity: 'VERIFIED',
  broken_chains: [],
  shifts: [
    {
      shift_id: 's1',
      worker_name: 'Joao Muniz Campos',
      worker_employee_id: 'EMP-JOAO',
      site_name: 'Mt Stromlo',
      shift_date: '2026-06-16',
      start_time: '',
      end_time: '',
      break_minutes: 15,
      total_hours: 0.37,
      status: 'EXPORTED',
      receipt_id: 'FSTR-C3LMPJYS',
      events: [],
      hash_chain_valid: true,
    },
  ],
};

const req = (q: string) =>
  new Request(`http://test/api/command/payruns/verify?q=${encodeURIComponent(q)}`);

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ companyId: COMPANY });
  byHashMock.mockResolvedValue({ data: EXPORT_ROW, error: null });
  byReceiptMock.mockResolvedValue({ data: { id: 's1' }, error: null });
  containingMock.mockResolvedValue({ data: EXPORT_ROW, error: null });
  genPackMock.mockResolvedValue(PACK);
});

describe('GET payruns/verify', () => {
  it('400 for unrecognised input', async () => {
    const res = await GET(req('hello world'));
    expect(res.status).toBe(400);
    expect(byHashMock).not.toHaveBeenCalled();
    expect(byReceiptMock).not.toHaveBeenCalled();
  });

  it('resolves a receipt code → shift → export → VERIFIED', async () => {
    const res = await GET(req('fstr-c3lmpjys'));
    expect(res.status).toBe(200);
    expect(byReceiptMock).toHaveBeenCalledWith('FSTR-C3LMPJYS');
    expect(containingMock).toHaveBeenCalledWith('s1');
    const body = await res.json();
    expect(body.status).toBe('VERIFIED');
    expect(body.totals.hours).toBe(0.37);
    expect(body.shifts[0].receipt_id).toBe('FSTR-C3LMPJYS');
  });

  it('resolves a file hash directly', async () => {
    const res = await GET(req(FILE_HASH));
    expect(res.status).toBe(200);
    expect(byHashMock).toHaveBeenCalledWith(FILE_HASH);
    expect(byReceiptMock).not.toHaveBeenCalled();
  });

  it('404 when the receipt matches no shift', async () => {
    byReceiptMock.mockResolvedValue({ data: null, error: null });
    const res = await GET(req('FSTR-NOPE0000'));
    expect(res.status).toBe(404);
    expect(genPackMock).not.toHaveBeenCalled();
  });

  it('404 when the shift is not in any export', async () => {
    containingMock.mockResolvedValue({ data: null, error: null });
    const res = await GET(req('FSTR-C3LMPJYS'));
    expect(res.status).toBe(404);
  });
});
