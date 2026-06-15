// POST /api/command/payruns/run — readiness + enablement gates.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
const { shiftsBetweenMock, pageRepoMock, anchorMock, healthMock, shiftsByIdsMock, payRunsRepoMock } =
  vi.hoisted(() => {
    const shiftsBetweenMock = vi.fn();
    const pageRepoMock = vi.fn(() => ({ shiftsBetween: shiftsBetweenMock }));
    const anchorMock = vi.fn();
    const healthMock = vi.fn();
    const shiftsByIdsMock = vi.fn();
    const payRunsRepoMock = vi.fn(() => ({ shiftsByIds: shiftsByIdsMock }));
    return { shiftsBetweenMock, pageRepoMock, anchorMock, healthMock, shiftsByIdsMock, payRunsRepoMock };
  });
const { processMock, exportsRepoMock } = vi.hoisted(() => {
  const processMock = vi.fn();
  const exportsRepoMock = vi.fn(() => ({ processFlostructionExport: processMock }));
  return { processMock, exportsRepoMock };
});
const { deriveChainMock } = vi.hoisted(() => ({ deriveChainMock: vi.fn() }));
const { logActionMock } = vi.hoisted(() => ({ logActionMock: vi.fn() }));

vi.mock('@/lib/auth/session', () => ({ getCompanyIdForSession: getSessionMock }));
vi.mock('@/lib/db/repositories/page.repo', () => ({
  pageRepo: pageRepoMock,
  payRunsRepo: payRunsRepoMock,
  anchorVerification: anchorMock,
  latestHealthChecks: healthMock,
}));
vi.mock('@/lib/db/repositories/exports.repo', () => ({ exportsRepo: exportsRepoMock }));
vi.mock('@/lib/page/today-data', () => ({ deriveChainState: deriveChainMock }));
vi.mock('@/lib/audit/admin-access-log', () => ({ logAdminAction: logActionMock }));
vi.mock('@/lib/logger', () => ({
  routeLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/lib/auth/response', () => ({
  authErrorResponse: (err: { status?: number; code?: string }) =>
    new Response(JSON.stringify({ error: err.code ?? 'AUTH' }), { status: err.status ?? 401 }),
}));

import { POST } from './route';

const COMPANY = '00000000-1000-4000-8000-000000000001';
const USER = '00000000-1000-4000-8000-0000000000aa';

const APPROVED = { id: 'a1', status: 'PAYROLL_APPROVED' };
const SUBMITTED = { id: 's1', status: 'SUBMITTED' };

const SHIFT_ROW = {
  id: 'a1', company_id: COMPANY, worker_id: 'w1', site_id: 's1',
  shift_date: '2026-06-10', start_time: '2026-06-09T21:00:00.000Z',
  end_time: '2026-06-10T05:30:00.000Z', break_minutes: 30, total_hours: '8.00',
  status: 'PAYROLL_APPROVED', receipt_id: 'FSTR-AB12CD34', worker_note: '',
  workers: { first_name: 'Joao', last_name: 'Silva', employee_id: 'EMP-JOAO', pay_rate: '28.47' },
  sites: { name: 'Mt Stromlo Works' },
};

const req = () => new Request('http://test/api/command/payruns/run', { method: 'POST' });

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.PAYRUN_RUN_ENABLED;
  getSessionMock.mockResolvedValue({ companyId: COMPANY, userId: USER });
  anchorMock.mockResolvedValue({ data: [] });
  healthMock.mockResolvedValue({ data: [] });
  deriveChainMock.mockReturnValue({ broken: false });
  shiftsBetweenMock.mockResolvedValue({ data: [APPROVED] });
  shiftsByIdsMock.mockResolvedValue({ data: [SHIFT_ROW] });
  processMock.mockResolvedValue({ data: [{ export_id: 'exp-1', exported_shifts: ['a1'] }], error: null });
});
afterEach(() => {
  delete process.env.PAYRUN_RUN_ENABLED;
});

describe('POST run — gates', () => {
  it('409 HELD when the chain is broken', async () => {
    deriveChainMock.mockReturnValue({ broken: true });
    const res = await POST(req());
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j.state).toBe('HELD');
    expect(processMock).not.toHaveBeenCalled();
  });

  it('409 WAITING when a submitted shift is still pending', async () => {
    shiftsBetweenMock.mockResolvedValue({ data: [APPROVED, SUBMITTED] });
    const res = await POST(req());
    expect(res.status).toBe(409);
    expect((await res.json()).state).toBe('WAITING');
  });

  it('409 EMPTY when nothing is approved', async () => {
    shiftsBetweenMock.mockResolvedValue({ data: [] });
    const res = await POST(req());
    expect(res.status).toBe(409);
    expect((await res.json()).state).toBe('EMPTY');
  });

  it('423 READY-but-locked when run is disabled (production default)', async () => {
    const res = await POST(req());
    expect(res.status).toBe(423);
    const j = await res.json();
    expect(j.state).toBe('READY');
    expect(j.locked).toBe(true);
    expect(processMock).not.toHaveBeenCalled();
  });

  it('200 executes the export when enabled', async () => {
    process.env.PAYRUN_RUN_ENABLED = 'true';
    const res = await POST(req());
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.exportId).toBe('exp-1');
    const call = processMock.mock.calls[0]?.[0] as { shiftIds: string[]; fileHash: string };
    expect(call.shiftIds).toEqual(['a1']);
    expect(call.fileHash).toMatch(/^[0-9a-f]{64}$/);
    const audit = logActionMock.mock.calls[0]?.[1] as { action: string; reasonCode: string };
    expect(audit.action).toBe('export');
    expect(audit.reasonCode).toBe('payrun_run_when_safe');
  });

  it('500 when the export RPC errors', async () => {
    process.env.PAYRUN_RUN_ENABLED = 'true';
    processMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const res = await POST(req());
    expect(res.status).toBe(500);
  });
});
