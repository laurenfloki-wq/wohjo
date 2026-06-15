// PATCH /api/command/workers/[workerId] — amendment + audit tests.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
const { getByIdMock, findPhoneMock, updateMock, repoMock } = vi.hoisted(() => {
  const getByIdMock = vi.fn();
  const findPhoneMock = vi.fn();
  const updateMock = vi.fn();
  const repoMock = vi.fn(() => ({
    getById: getByIdMock,
    findIdByPhone: findPhoneMock,
    updateFields: updateMock,
  }));
  return { getByIdMock, findPhoneMock, updateMock, repoMock };
});
const { logActionMock } = vi.hoisted(() => ({ logActionMock: vi.fn() }));

vi.mock('@/lib/auth/session', () => ({ getCompanyIdForSession: getSessionMock }));
vi.mock('@/lib/db/repositories/workers.repo', () => ({ workersRepo: repoMock }));
vi.mock('@/lib/audit/admin-access-log', () => ({ logAdminAction: logActionMock }));
vi.mock('@/lib/logger', () => ({
  routeLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/lib/auth/response', () => ({
  authErrorResponse: (err: { status?: number; code?: string }) =>
    new Response(JSON.stringify({ error: err.code ?? 'AUTH' }), {
      status: err.status ?? 401,
      headers: { 'content-type': 'application/json' },
    }),
}));

import { PATCH } from './route';

const COMPANY = '00000000-1000-4000-8000-000000000001';
const USER = '00000000-1000-4000-8000-0000000000aa';
const WORKER = '22222222-2222-4222-8222-222222222222';

const BASE = {
  id: WORKER,
  first_name: 'Joao',
  last_name: 'Silva',
  phone: '+61451258610',
  email: null as string | null,
  employee_id: 'E-1',
  pay_rate: '28.47',
  award_classification: null as string | null,
  is_active: true,
};

function req(body: Record<string, unknown>) {
  return new Request(`http://test/api/command/workers/${WORKER}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ workerId: WORKER }) };

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ companyId: COMPANY, userId: USER, role: 'owner' });
  getByIdMock.mockResolvedValue({ data: { ...BASE }, error: null });
  findPhoneMock.mockResolvedValue({ data: null });
  updateMock.mockResolvedValue({ data: { ...BASE }, error: null });
});

describe('PATCH worker — amendment + audit', () => {
  it('404 when the worker is not in this company', async () => {
    getByIdMock.mockResolvedValue({ data: null, error: null });
    const res = await PATCH(req({ pay_rate: '30.00' }), ctx);
    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rejects out-of-bounds pay rate (400) without writing', async () => {
    const res = await PATCH(req({ pay_rate: '999' }), ctx);
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
    expect(logActionMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid mobile (400)', async () => {
    const res = await PATCH(req({ phone: 'not-a-phone' }), ctx);
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('409 when the new phone belongs to another worker', async () => {
    findPhoneMock.mockResolvedValue({ data: { id: 'someone-else' } });
    const res = await PATCH(req({ phone: '0412 345 678' }), ctx);
    expect(res.status).toBe(409);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('amends pay rate: updates the row and records an AMEND audit line', async () => {
    updateMock.mockResolvedValue({ data: { ...BASE, pay_rate: '30.00' }, error: null });
    const res = await PATCH(req({ pay_rate: '30.00' }), ctx);
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledTimes(1);
    const patch = updateMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patch.pay_rate).toBe('30.00');
    expect(logActionMock).toHaveBeenCalledTimes(1);
    const audit = logActionMock.mock.calls[0]?.[1] as { action: string; resourceType: string };
    expect(audit.action).toBe('AMEND');
    expect(audit.resourceType).toBe('worker');
  });

  it('deactivate writes is_active=false with a DEACTIVATE audit line', async () => {
    updateMock.mockResolvedValue({ data: { ...BASE, is_active: false }, error: null });
    const res = await PATCH(req({ is_active: false }), ctx);
    expect(res.status).toBe(200);
    const patch = updateMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patch.is_active).toBe(false);
    const audit = logActionMock.mock.calls[0]?.[1] as { action: string };
    expect(audit.action).toBe('DEACTIVATE');
  });

  it('no-op when nothing changed: 200 unchanged, no write', async () => {
    const res = await PATCH(req({ pay_rate: '28.47', first_name: 'Joao' }), ctx);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { unchanged?: boolean };
    expect(json.unchanged).toBe(true);
    expect(updateMock).not.toHaveBeenCalled();
    expect(logActionMock).not.toHaveBeenCalled();
  });
});
