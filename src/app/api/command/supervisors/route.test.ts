// Route-layer test pinning the invariant Lauren observed at /command/supervisors:
// "Supervisor row seeded via SQL with is_active=true and company_id matching the
// session's admin company_id must appear in /api/command/supervisors GET response."
//
// 2026-04-30 evening — Lauren observed UI showing "0 registered" while DB has
// 1 active supervisor. Investigation found the route is structurally identical
// to /api/command/sites and /api/command/workers, both of which work correctly.
// Most likely cause is data-state (row's company_id mismatches what was seeded)
// not code. This test pins the code-layer invariant so future regressions
// at the route layer are caught.
//
// See ~/Desktop/FLOSTRUCTION-Build/supervisors-rendering-bug-audit-2026-04-30.md
// for full investigation.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks ------------------------------------------------------------

const { authenticatedAdminCompanyMock } = vi.hoisted(() => ({
  authenticatedAdminCompanyMock: vi.fn(),
}));
const { serviceQueryMock } = vi.hoisted(() => ({
  serviceQueryMock: { from: vi.fn() },
}));

vi.mock('@/lib/auth/session', () => ({
  getCompanyIdForSession: authenticatedAdminCompanyMock,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn().mockReturnValue(serviceQueryMock),
}));
vi.mock('@/lib/auth/response', () => ({
  authErrorResponse: vi.fn().mockImplementation((err: { status?: number; message?: string }) => ({
    status: err.status ?? 500,
    json: async () => ({ error: err.message ?? 'auth error' }),
  })),
}));
vi.mock('@/lib/logger', () => ({
  routeLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  }),
}));

import { GET } from './route';

const TENANT_TEST = '00000000-1000-0000-0000-000000000001';
const TENANT_OTHER = '22222222-0000-0000-0000-000000000002';

// Helper: build a Supabase query-builder mock that returns `rows` filtered
// by accumulated .eq() calls — mirrors the production pattern from the
// dashboard counters test (see src/app/(command)/command/dashboard/counters.test.ts).
type Row = Record<string, unknown>;
function mockSupervisorsTable(rows: Row[]): { eqFiltersSeen: Array<[string, unknown]> } {
  const eqFiltersSeen: Array<[string, unknown]> = [];
  function chain(filters: Array<[string, unknown]>): Record<string, unknown> {
    return {
      eq(col: string, val: unknown) {
        eqFiltersSeen.push([col, val]);
        return chain([...filters, [col, val]]);
      },
      order() {
        return {
          then(resolve: (v: { data: Row[]; error: null }) => void) {
            const data = rows.filter((row) =>
              filters.every(([key, value]) => row[key] === value),
            );
            resolve({ data, error: null });
          },
        };
      },
    };
  }
  serviceQueryMock.from.mockImplementation((table: string) => {
    if (table !== 'supervisors') throw new Error(`unexpected from(${table})`);
    return { select: () => chain([]) };
  });
  return { eqFiltersSeen };
}

beforeEach(() => {
  authenticatedAdminCompanyMock.mockReset();
  serviceQueryMock.from.mockReset();
});

// --- Tests -----------------------------------------------------------

describe('GET /api/command/supervisors — invariant pinning', () => {
  it('returns supervisor row when company_id matches session admin company', async () => {
    authenticatedAdminCompanyMock.mockResolvedValue({
      userId: 'auth-user-1',
      companyId: TENANT_TEST,
      role: 'director',
    });
    mockSupervisorsTable([
      {
        id: '00000000-1000-0000-0000-000000000003',
        company_id: TENANT_TEST,
        name: 'Lauren de Mestre',
        phone: '+61413573579',
        email: 'lauren.flosmosis@gmail.com',
        is_active: true,
        verify_token: 'tok-deadbeef',
        created_at: '2026-04-30T12:30:00Z',
      },
    ]);

    const req = new Request('http://test/api/command/supervisors', {
      headers: { 'x-request-id': 'test-req-1' },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(body.supervisors).toHaveLength(1);
    expect(body.supervisors[0]).toMatchObject({
      id: '00000000-1000-0000-0000-000000000003',
      name: 'Lauren de Mestre',
      is_active: true,
    });
  });

  it('does NOT return supervisor rows from other tenants', async () => {
    authenticatedAdminCompanyMock.mockResolvedValue({
      userId: 'auth-user-1',
      companyId: TENANT_TEST,
      role: 'director',
    });
    mockSupervisorsTable([
      {
        id: 'sup-A',
        company_id: TENANT_TEST,
        name: 'Tenant A Supervisor',
        is_active: true,
        verify_token: 'tok-a',
        phone: '+61400000001',
        email: null,
        created_at: '2026-04-30T12:00:00Z',
      },
      {
        id: 'sup-B',
        company_id: TENANT_OTHER,
        name: 'Tenant B Supervisor',
        is_active: true,
        verify_token: 'tok-b',
        phone: '+61400000002',
        email: null,
        created_at: '2026-04-30T12:01:00Z',
      },
    ]);

    const req = new Request('http://test/api/command/supervisors', {
      headers: { 'x-request-id': 'test-req-2' },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(body.supervisors).toHaveLength(1);
    expect(body.supervisors[0].id).toBe('sup-A');
  });

  it('always passes a company_id filter to the supervisors table query', async () => {
    authenticatedAdminCompanyMock.mockResolvedValue({
      userId: 'auth-user-1',
      companyId: TENANT_TEST,
      role: 'director',
    });
    const { eqFiltersSeen } = mockSupervisorsTable([]);

    const req = new Request('http://test/api/command/supervisors', {
      headers: { 'x-request-id': 'test-req-3' },
    });
    await GET(req);

    // Tenant-isolation invariant: the route MUST filter by company_id.
    // If a future refactor accidentally drops this filter, the test fails.
    expect(eqFiltersSeen).toContainEqual(['company_id', TENANT_TEST]);
  });

  it('returns supervisor regardless of is_active value (route does not filter on is_active)', async () => {
    // Sites/Workers pages display Active/Inactive both. Route-level filter
    // on is_active=true would break that. Pinning the route's actual behaviour.
    authenticatedAdminCompanyMock.mockResolvedValue({
      userId: 'auth-user-1',
      companyId: TENANT_TEST,
      role: 'director',
    });
    mockSupervisorsTable([
      {
        id: 'sup-active',
        company_id: TENANT_TEST,
        name: 'Active Sup',
        is_active: true,
        verify_token: 't1',
        phone: '+61400000001',
        email: null,
        created_at: '2026-04-30T12:00:00Z',
      },
      {
        id: 'sup-inactive',
        company_id: TENANT_TEST,
        name: 'Inactive Sup',
        is_active: false,
        verify_token: 't2',
        phone: '+61400000002',
        email: null,
        created_at: '2026-04-30T12:01:00Z',
      },
    ]);

    const req = new Request('http://test/api/command/supervisors', {
      headers: { 'x-request-id': 'test-req-4' },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(body.supervisors).toHaveLength(2);
  });
});
