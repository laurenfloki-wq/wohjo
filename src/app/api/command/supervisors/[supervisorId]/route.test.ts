// PATCH /api/command/supervisors/[supervisorId] — amendment + audit tests.

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
vi.mock('@/lib/db/repositories/supervisors.repo', () => ({ supervisorsRepo: repoMock }));
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
const SUP = '33333333-3333-4333-8333-333333333333';

const BASE = {
  id: SUP,
  name: 'Reg Foreman',
  phone: '+61400000001',
  email: null as string | null,
  is_active: true,
};

function req(body: Record<string, unknown>) {
  return new Request(`http://test/api/command/supervisors/${SUP}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ supervisorId: SUP }) };

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ companyId: COMPANY, userId: USER, role: 'owner' });
  getByIdMock.mockResolvedValue({ data: { ...BASE }, error: null });
  findPhoneMock.mockResolvedValue({ data: null });
  updateMock.mockResolvedValue({ data: { ...BASE }, error: null });
});

describe('PATCH supervisor — amendment + audit', () => {
  it('404 when not in this company', async () => {
    getByIdMock.mockResolvedValue({ data: null, error: null });
    const res = await PATCH(req({ name: 'X' }), ctx);
    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid mobile (400)', async () => {
    const res = await PATCH(req({ phone: 'nope' }), ctx);
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('409 when the new phone belongs to another supervisor', async () => {
    findPhoneMock.mockResolvedValue({ data: { id: 'other' } });
    const res = await PATCH(req({ phone: '0412 345 678' }), ctx);
    expect(res.status).toBe(409);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('amends name with an AMEND audit line', async () => {
    updateMock.mockResolvedValue({ data: { ...BASE, name: 'Reginald Foreman' }, error: null });
    const res = await PATCH(req({ name: 'Reginald Foreman' }), ctx);
    expect(res.status).toBe(200);
    const patch = updateMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patch.name).toBe('Reginald Foreman');
    const audit = logActionMock.mock.calls[0]?.[1] as { action: string; resourceType: string };
    expect(audit.action).toBe('AMEND');
    expect(audit.resourceType).toBe('supervisor');
  });

  it('deactivate -> is_active=false with DEACTIVATE audit', async () => {
    updateMock.mockResolvedValue({ data: { ...BASE, is_active: false }, error: null });
    const res = await PATCH(req({ is_active: false }), ctx);
    expect(res.status).toBe(200);
    const audit = logActionMock.mock.calls[0]?.[1] as { action: string };
    expect(audit.action).toBe('DEACTIVATE');
  });

  it('no-op when nothing changed', async () => {
    const res = await PATCH(req({ name: 'Reg Foreman' }), ctx);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { unchanged?: boolean };
    expect(json.unchanged).toBe(true);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
