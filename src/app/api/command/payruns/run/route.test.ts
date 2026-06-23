// POST /api/command/payruns/run — gates, completeness (all approved shifts,
// no date window), the include/hold decision, and the real assembly call.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
const { anchorMock, healthMock } = vi.hoisted(() => ({ anchorMock: vi.fn(), healthMock: vi.fn() }));
const { getAllApprovedMock } = vi.hoisted(() => ({ getAllApprovedMock: vi.fn() }));
const { assembleMock } = vi.hoisted(() => ({ assembleMock: vi.fn() }));
const { deriveChainMock } = vi.hoisted(() => ({ deriveChainMock: vi.fn() }));
const { logActionMock } = vi.hoisted(() => ({ logActionMock: vi.fn() }));

vi.mock('@/lib/auth/session', () => ({ getCompanyIdForSession: getSessionMock }));
vi.mock('@/lib/db/repositories/page.repo', () => ({
  anchorVerification: anchorMock,
  latestHealthChecks: healthMock,
}));
vi.mock('@/lib/export/get-approved-shifts', () => ({ getAllApprovedShifts: getAllApprovedMock }));
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

function approved(id: string, shift_date = '2026-06-17') {
  return { id, shift_date, total_hours: 8, worker_id: 'w1', company_id: COMPANY, site_id: null };
}

function req(body?: unknown) {
  return new Request('http://test/api/command/payruns/run', {
    method: 'POST',
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }
      : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.PAYRUN_RUN_ENABLED;
  getSessionMock.mockResolvedValue({ companyId: COMPANY, userId: USER });
  anchorMock.mockResolvedValue({ data: [] });
  healthMock.mockResolvedValue({ data: [] });
  deriveChainMock.mockReturnValue({ broken: false });
  getAllApprovedMock.mockResolvedValue([approved('a1')]);
  assembleMock.mockResolvedValue({ ok: true, exportId: 'exp-1', shiftCount: 1 });
});
afterEach(() => {
  delete process.env.PAYRUN_RUN_ENABLED;
});

describe('POST run — gates + completeness + hold', () => {
  it('409 HELD when the chain is broken — never assembles', async () => {
    deriveChainMock.mockReturnValue({ broken: true });
    const res = await POST(req());
    expect(res.status).toBe(409);
    expect((await res.json()).state).toBe('HELD');
    expect(assembleMock).not.toHaveBeenCalled();
  });

  it('409 EMPTY when nothing is approved', async () => {
    getAllApprovedMock.mockResolvedValue([]);
    const res = await POST(req());
    expect(res.status).toBe(409);
    expect((await res.json()).state).toBe('EMPTY');
    expect(assembleMock).not.toHaveBeenCalled();
  });

  it('runs every approved shift regardless of age — period derived from shift dates', async () => {
    getAllApprovedMock.mockResolvedValue([approved('old', '2026-05-01'), approved('new', '2026-06-17')]);
    const res = await POST(req());
    expect(res.status).toBe(200);
    const call = assembleMock.mock.calls[0]?.[0] as {
      payPeriodStart: string;
      payPeriodEnd: string;
      shifts: Array<{ id: string }>;
    };
    expect(call.shifts.map((s) => s.id).sort()).toEqual(['new', 'old']);
    expect(call.payPeriodStart).toBe('2026-05-01'); // earliest included
    expect(call.payPeriodEnd).toBe('2026-06-17'); // latest included
  });

  it('held shifts are excluded from the run but the rest still run', async () => {
    getAllApprovedMock.mockResolvedValue([approved('a1', '2026-06-10'), approved('a2', '2026-06-17')]);
    const res = await POST(req({ hold_shift_ids: ['a1'] }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.heldCount).toBe(1);
    const call = assembleMock.mock.calls[0]?.[0] as {
      payPeriodStart: string;
      shifts: Array<{ id: string }>;
    };
    expect(call.shifts.map((s) => s.id)).toEqual(['a2']);
    expect(call.payPeriodStart).toBe('2026-06-17'); // a1 held, so period starts at a2
    const audit = logActionMock.mock.calls[0]?.[1] as { reasonCode: string };
    expect(audit.reasonCode).toContain('held 1');
  });

  it('409 EMPTY when every approved shift is held', async () => {
    getAllApprovedMock.mockResolvedValue([approved('a1')]);
    const res = await POST(req({ hold_shift_ids: ['a1'] }));
    expect(res.status).toBe(409);
    expect((await res.json()).state).toBe('EMPTY');
    expect(assembleMock).not.toHaveBeenCalled();
  });

  it('423 READY-but-locked only when explicitly disabled (kill switch)', async () => {
    process.env.PAYRUN_RUN_ENABLED = 'false';
    const res = await POST(req());
    expect(res.status).toBe(423);
    const j = await res.json();
    expect(j.state).toBe('READY');
    expect(j.locked).toBe(true);
    expect(assembleMock).not.toHaveBeenCalled();
  });

  it('200 by default — assembles a real Employment Hero export and audits it', async () => {
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
    expect(audit.reasonCode).toContain('payrun_run_when_safe');
  });

  it('propagates the assemble failure status', async () => {
    assembleMock.mockResolvedValue({ ok: false, status: 500, error: 'boom' });
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('boom');
  });
});
