// POST /api/command/payruns/run — readiness gate, kill switch, and the
// real WLES-v1 export assembly (Employment Hero).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
const { shiftsBetweenMock, pageRepoMock, anchorMock, healthMock } = vi.hoisted(() => {
  const shiftsBetweenMock = vi.fn();
  const pageRepoMock = vi.fn(() => ({ shiftsBetween: shiftsBetweenMock }));
  const anchorMock = vi.fn();
  const healthMock = vi.fn();
  return { shiftsBetweenMock, pageRepoMock, anchorMock, healthMock };
});
const { getApprovedShiftsMock } = vi.hoisted(() => ({ getApprovedShiftsMock: vi.fn() }));
const { assembleMock } = vi.hoisted(() => ({ assembleMock: vi.fn() }));
const { deriveChainMock } = vi.hoisted(() => ({ deriveChainMock: vi.fn() }));
const { logActionMock } = vi.hoisted(() => ({ logActionMock: vi.fn() }));

vi.mock('@/lib/auth/session', () => ({ getCompanyIdForSession: getSessionMock }));
vi.mock('@/lib/db/repositories/page.repo', () => ({
  pageRepo: pageRepoMock,
  anchorVerification: anchorMock,
  latestHealthChecks: healthMock,
}));
vi.mock('@/lib/export/get-approved-shifts', () => ({ getApprovedShifts: getApprovedShiftsMock }));
vi.mock('@/lib/payruns/assemble-export', () => ({ assemblePayrollExport: assembleMock }));
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

const req = () => new Request('http://test/api/command/payruns/run', { method: 'POST' });

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.PAYRUN_RUN_ENABLED;
  getSessionMock.mockResolvedValue({ companyId: COMPANY, userId: USER });
  anchorMock.mockResolvedValue({ data: [] });
  healthMock.mockResolvedValue({ data: [] });
  deriveChainMock.mockReturnValue({ broken: false });
  shiftsBetweenMock.mockResolvedValue({ data: [APPROVED] });
  getApprovedShiftsMock.mockResolvedValue([{ id: 'a1' }]);
  assembleMock.mockResolvedValue({ ok: true, exportId: 'exp-1', shiftCount: 1 });
});
afterEach(() => {
  delete process.env.PAYRUN_RUN_ENABLED;
});

describe('POST run — gates + execution', () => {
  it('409 HELD when the chain is broken — never assembles', async () => {
    deriveChainMock.mockReturnValue({ broken: true });
    const res = await POST(req());
    expect(res.status).toBe(409);
    expect((await res.json()).state).toBe('HELD');
    expect(assembleMock).not.toHaveBeenCalled();
  });

  it('409 WAITING when a submitted shift is still pending', async () => {
    shiftsBetweenMock.mockResolvedValue({ data: [APPROVED, SUBMITTED] });
    const res = await POST(req());
    expect(res.status).toBe(409);
    expect((await res.json()).state).toBe('WAITING');
    expect(assembleMock).not.toHaveBeenCalled();
  });

  it('409 EMPTY when nothing is approved', async () => {
    shiftsBetweenMock.mockResolvedValue({ data: [] });
    const res = await POST(req());
    expect(res.status).toBe(409);
    expect((await res.json()).state).toBe('EMPTY');
    expect(assembleMock).not.toHaveBeenCalled();
  });

  it('423 READY-but-locked ONLY when explicitly disabled (kill switch)', async () => {
    process.env.PAYRUN_RUN_ENABLED = 'false';
    const res = await POST(req());
    expect(res.status).toBe(423);
    const j = await res.json();
    expect(j.state).toBe('READY');
    expect(j.locked).toBe(true);
    expect(assembleMock).not.toHaveBeenCalled();
  });

  it('200 runs by default — assembles a real WLES-v1 Employment Hero export', async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.exportId).toBe('exp-1');
    const call = assembleMock.mock.calls[0]?.[0] as { providerId: string; adminUserId: string };
    expect(call.providerId).toBe('employment_hero');
    expect(call.adminUserId).toBe(USER);
    const audit = logActionMock.mock.calls[0]?.[1] as { action: string; reasonCode: string };
    expect(audit.action).toBe('export');
    expect(audit.reasonCode).toBe('payrun_run_when_safe');
  });

  it('propagates the assemble failure status (e.g. 500)', async () => {
    assembleMock.mockResolvedValue({ ok: false, status: 500, error: 'boom' });
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('boom');
  });

  it('propagates a 404 when no approved shifts assemble', async () => {
    assembleMock.mockResolvedValue({ ok: false, status: 404, error: 'No approved shifts' });
    const res = await POST(req());
    expect(res.status).toBe(404);
  });
});
