// GET /api/command/payruns/[exportId]/payroll — re-derived CSV download.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
const { getExportMock, shiftsByIdsMock, repoMock } = vi.hoisted(() => {
  const getExportMock = vi.fn();
  const shiftsByIdsMock = vi.fn();
  const repoMock = vi.fn(() => ({
    getExportById: getExportMock,
    shiftsByIds: shiftsByIdsMock,
  }));
  return { getExportMock, shiftsByIdsMock, repoMock };
});
const { logActionMock } = vi.hoisted(() => ({ logActionMock: vi.fn() }));

vi.mock('@/lib/auth/session', () => ({ getCompanyIdForSession: getSessionMock }));
vi.mock('@/lib/db/repositories/page.repo', () => ({ payRunsRepo: repoMock }));
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

const EXP = {
  id: EXPORT,
  pay_period_start: '2026-06-08',
  pay_period_end: '2026-06-14',
  exported_at: '2026-06-15T00:00:00.000Z',
  file_hash: null,
  shift_ids: ['11111111-1111-4111-8111-111111111111'],
};

const SHIFT = {
  id: '11111111-1111-4111-8111-111111111111',
  company_id: COMPANY,
  worker_id: 'w1',
  site_id: 's1',
  shift_date: '2026-06-10',
  start_time: '2026-06-09T21:00:00.000Z',
  end_time: '2026-06-10T05:30:00.000Z',
  break_minutes: 30,
  total_hours: '8.00',
  status: 'EXPORTED',
  receipt_id: 'FSTR-AB12CD34',
  worker_note: '',
  workers: { first_name: 'Joao', last_name: 'Silva', employee_id: 'EMP-JOAO', pay_rate: '28.47' },
  sites: { name: 'Mt Stromlo Works' },
};

const ctx = { params: Promise.resolve({ exportId: EXPORT }) };
const req = () => new Request(`http://test/api/command/payruns/${EXPORT}/payroll`);

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ companyId: COMPANY, userId: USER });
  getExportMock.mockResolvedValue({ data: { ...EXP }, error: null });
  shiftsByIdsMock.mockResolvedValue({ data: [SHIFT], error: null });
});

describe('GET payroll', () => {
  it('404 when the run is not in this company', async () => {
    getExportMock.mockResolvedValue({ data: null, error: null });
    const res = await GET(req(), ctx);
    expect(res.status).toBe(404);
    expect(shiftsByIdsMock).not.toHaveBeenCalled();
  });

  it('returns a CSV attachment derived from the sealed shifts', async () => {
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    const body = await res.text();
    expect(body.split('\n')[0]).toContain('Employee ID');
    expect(body).toContain('EMP-JOAO');
    expect(res.headers.get('x-payroll-file-hash')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('records an immutable export audit line', async () => {
    await GET(req(), ctx);
    const audit = logActionMock.mock.calls[0]?.[1] as { action: string; resourceType: string };
    expect(audit.action).toBe('export');
    expect(audit.resourceType).toBe('export');
  });
});
