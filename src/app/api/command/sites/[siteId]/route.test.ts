// PATCH /api/command/sites/[siteId] — amendment + audit tests.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
const { getByIdMock, updateMock, repoMock } = vi.hoisted(() => {
  const getByIdMock = vi.fn();
  const updateMock = vi.fn();
  const repoMock = vi.fn(() => ({ getById: getByIdMock, updateFields: updateMock }));
  return { getByIdMock, updateMock, repoMock };
});
const { logActionMock } = vi.hoisted(() => ({ logActionMock: vi.fn() }));

vi.mock('@/lib/auth/session', () => ({ getCompanyIdForSession: getSessionMock }));
vi.mock('@/lib/db/repositories/sites.repo', () => ({ sitesRepo: repoMock }));
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
const SITE = '44444444-4444-4444-8444-444444444444';

const BASE = {
  id: SITE,
  name: 'Mt Stromlo Works',
  address: '1 Cotter Rd',
  site_code: 'FSTR-SITE-1',
  geofence_radius_metres: 200,
  is_active: true,
};

function req(body: Record<string, unknown>) {
  return new Request(`http://test/api/command/sites/${SITE}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ siteId: SITE }) };

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ companyId: COMPANY, userId: USER, role: 'owner' });
  getByIdMock.mockResolvedValue({ data: { ...BASE }, error: null });
  updateMock.mockResolvedValue({ data: { ...BASE }, error: null });
});

describe('PATCH site — amendment + audit', () => {
  it('404 when not in this company', async () => {
    getByIdMock.mockResolvedValue({ data: null, error: null });
    const res = await PATCH(req({ name: 'X' }), ctx);
    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rejects out-of-bounds geofence radius (400)', async () => {
    const res = await PATCH(req({ geofence_radius_metres: 5000 }), ctx);
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('amends geofence radius with an AMEND audit line', async () => {
    updateMock.mockResolvedValue({ data: { ...BASE, geofence_radius_metres: 150 }, error: null });
    const res = await PATCH(req({ geofence_radius_metres: 150 }), ctx);
    expect(res.status).toBe(200);
    const patch = updateMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patch.geofence_radius_metres).toBe(150);
    const audit = logActionMock.mock.calls[0]?.[1] as {
      action: string;
      resourceType: string;
      reasonCode: string;
    };
    expect(audit.action).toBe('update');
    expect(audit.reasonCode).toContain('site amended');
    expect(audit.resourceType).toBe('site');
  });

  it('close site -> is_active=false with a closed audit', async () => {
    updateMock.mockResolvedValue({ data: { ...BASE, is_active: false }, error: null });
    const res = await PATCH(req({ is_active: false }), ctx);
    expect(res.status).toBe(200);
    const audit = logActionMock.mock.calls[0]?.[1] as { action: string; reasonCode: string };
    expect(audit.action).toBe('update');
    expect(audit.reasonCode).toContain('site closed');
  });

  it('no-op when nothing changed', async () => {
    const res = await PATCH(req({ name: 'Mt Stromlo Works', geofence_radius_metres: 200 }), ctx);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { unchanged?: boolean };
    expect(json.unchanged).toBe(true);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
