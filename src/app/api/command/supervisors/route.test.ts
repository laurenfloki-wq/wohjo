// Route-layer test pinning the invariant Lauren observed at /command/supervisors:
// "Supervisor row seeded via SQL with is_active=true and company_id matching the
// session's admin company_id must appear in /api/command/supervisors GET response."
//
// 2026-05-01 Friday morning — Lauren's parallel SQL queries surfaced the
// actual root cause: supervisors table had no `created_at` column. Route
// was SELECTing `created_at` and ORDERing by it, so Supabase returned
// "column does not exist" -> 500 -> page silently rendered "0 registered."
//
// Stage 1 fix at 4f97f6a kept the page working during the migration window
// by omitting created_at from SELECT and ordering by name asc.
//
// 2026-05-01 1:26pm AEST — migration 202605010945_supervisors_add_created_at.sql
// applied to production. Existing supervisor row backfilled with
// 2026-05-01 03:26:39+00. The schema drift is closed.
//
// Stage 2 fix shipped this commit (post-migration):
//   - SELECT references created_at (canonical pattern matching workers/sites)
//   - ORDER BY created_at desc (canonical pattern; newest first)
//   - SELECT continues to include site_ids and supabase_user_id (Stage 1
//     additions the page component depends on)
//   - Cache-theatre directives stay removed (Stage 1 already cleaned them up)
//
// Tests pinned in this file:
//   - GET returns row when company_id matches session admin company
//   - GET filters cross-tenant rows
//   - GET always passes company_id filter (tenant isolation)
//   - GET does NOT filter on is_active (Active+Inactive both display)
//   - GET orders by created_at desc (Stage 2 canonical ordering)
//   - Schema-drift guard: SELECT clause references only columns that now
//     exist in production; created_at is REQUIRED in SELECT and ORDER
//
// See ~/Desktop/FLOSTRUCTION-Build/supervisors-rendering-bug-audit-2026-04-30.md
// for the original investigation.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

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
// by accumulated .eq() calls and ordered by .order(column, { ascending }).
type Row = Record<string, unknown>;
function mockSupervisorsTable(rows: Row[]): {
  eqFiltersSeen: Array<[string, unknown]>;
  selectColumnsSeen: string[];
  orderCallsSeen: Array<[string, { ascending: boolean }]>;
} {
  const eqFiltersSeen: Array<[string, unknown]> = [];
  const selectColumnsSeen: string[] = [];
  const orderCallsSeen: Array<[string, { ascending: boolean }]> = [];

  function chain(filters: Array<[string, unknown]>): Record<string, unknown> {
    return {
      eq(col: string, val: unknown) {
        eqFiltersSeen.push([col, val]);
        return chain([...filters, [col, val]]);
      },
      order(col: string, opts: { ascending: boolean }) {
        orderCallsSeen.push([col, opts]);
        return {
          then(resolve: (v: { data: Row[]; error: null }) => void) {
            const filtered = rows.filter((row) =>
              filters.every(([key, value]) => row[key] === value),
            );
            const sorted = [...filtered].sort((a, b) => {
              const av = String(a[col] ?? '');
              const bv = String(b[col] ?? '');
              return opts.ascending ? av.localeCompare(bv) : bv.localeCompare(av);
            });
            resolve({ data: sorted, error: null });
          },
        };
      },
    };
  }
  serviceQueryMock.from.mockImplementation((table: string) => {
    if (table !== 'supervisors') throw new Error(`unexpected from(${table})`);
    return {
      select: (cols: string) => {
        selectColumnsSeen.push(cols);
        return chain([]);
      },
    };
  });
  return { eqFiltersSeen, selectColumnsSeen, orderCallsSeen };
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
        site_ids: null,
        supabase_user_id: null,
        created_at: '2026-05-01T03:26:39.803Z',
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
        name: 'A Tenant Supervisor',
        is_active: true,
        verify_token: 'tok-a',
        phone: '+61400000001',
        email: null,
        site_ids: null,
        supabase_user_id: null,
        created_at: '2026-05-01T03:00:00.000Z',
      },
      {
        id: 'sup-B',
        company_id: TENANT_OTHER,
        name: 'B Tenant Supervisor',
        is_active: true,
        verify_token: 'tok-b',
        phone: '+61400000002',
        email: null,
        site_ids: null,
        supabase_user_id: null,
        created_at: '2026-05-01T03:01:00.000Z',
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
        site_ids: null,
        supabase_user_id: null,
        created_at: '2026-05-01T03:00:00.000Z',
      },
      {
        id: 'sup-inactive',
        company_id: TENANT_TEST,
        name: 'Inactive Sup',
        is_active: false,
        verify_token: 't2',
        phone: '+61400000002',
        email: null,
        site_ids: null,
        supabase_user_id: null,
        created_at: '2026-05-01T03:01:00.000Z',
      },
    ]);

    const req = new Request('http://test/api/command/supervisors', {
      headers: { 'x-request-id': 'test-req-4' },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(body.supervisors).toHaveLength(2);
  });

  it('orders supervisors by created_at descending (Stage 2 canonical ordering)', async () => {
    authenticatedAdminCompanyMock.mockResolvedValue({
      userId: 'auth-user-1',
      companyId: TENANT_TEST,
      role: 'director',
    });
    const { orderCallsSeen } = mockSupervisorsTable([
      {
        id: 'sup-old', company_id: TENANT_TEST, name: 'Older Supervisor',
        is_active: true, verify_token: 't1', phone: '+61400000003',
        email: null, site_ids: null, supabase_user_id: null,
        created_at: '2026-04-29T03:00:00.000Z',
      },
      {
        id: 'sup-new', company_id: TENANT_TEST, name: 'Newer Supervisor',
        is_active: true, verify_token: 't2', phone: '+61400000004',
        email: null, site_ids: null, supabase_user_id: null,
        created_at: '2026-05-01T03:00:00.000Z',
      },
    ]);

    const req = new Request('http://test/api/command/supervisors', {
      headers: { 'x-request-id': 'test-req-5' },
    });
    const res = await GET(req);
    const body = await res.json();

    // Canonical pattern matches workers/sites: ORDER BY created_at DESC.
    expect(orderCallsSeen).toEqual([['created_at', { ascending: false }]]);
    // Newer first
    expect(body.supervisors.map((s: { id: string }) => s.id)).toEqual(['sup-new', 'sup-old']);
  });
});

// --- Schema-drift guard (Stage 2 — post-migration) -----------------------
// These tests pin the SELECT clause against the actual production schema
// after migration 202605010945_supervisors_add_created_at.sql applied
// 2026-05-01 1:26pm AEST. The created_at column NOW EXISTS, so the
// canonical SELECT must include it (and the canonical ORDER must use it).
//
// Production supervisors columns (post-migration, per
// information_schema.columns):
//   id, company_id, name, phone, email, supabase_user_id, site_ids,
//   is_active, pending_sms_approval_ids, last_batch_sms_date,
//   verify_token, created_at
//
// Notably still absent: updated_at.

describe('Schema-drift guard — supervisors route SELECT clause', () => {
  const ROUTE_SOURCE = fs.readFileSync(
    path.join(process.cwd(), 'src/app/api/command/supervisors/route.ts'),
    'utf-8',
  );

  it('SELECTs created_at (Stage 2 canonical — post-migration)', () => {
    // The Stage 1 fix at 4f97f6a removed created_at from SELECT to keep
    // the page working while the migration was pending. With the migration
    // applied, the canonical pattern (matching workers/sites/companies)
    // requires created_at IN the SELECT.
    const selectFromSupervisors = ROUTE_SOURCE.match(
      /from\('supervisors'\)\s*\n?\s*\.select\((['"`])([^'"`]+)\1\)/,
    );
    expect(selectFromSupervisors).not.toBeNull();
    const selectColumns = selectFromSupervisors?.[2] ?? '';
    expect(selectColumns).toMatch(/\bcreated_at\b/);
  });

  it('does NOT SELECT updated_at (still absent from production)', () => {
    const selectFromSupervisors = ROUTE_SOURCE.match(
      /from\('supervisors'\)\s*\n?\s*\.select\((['"`])([^'"`]+)\1\)/,
    );
    const selectColumns = selectFromSupervisors?.[2] ?? '';
    expect(selectColumns).not.toMatch(/\bupdated_at\b/);
  });

  it('ORDERs by created_at descending (Stage 2 canonical pattern)', () => {
    // Match `.order('created_at', { ascending: false })` — newest first.
    expect(ROUTE_SOURCE).toMatch(
      /\.order\(['"`]created_at['"`],\s*\{\s*ascending:\s*false\s*\}\s*\)/,
    );
  });

  it('SELECT clause references only columns that exist in production', () => {
    const PRODUCTION_COLUMNS = new Set([
      'id',
      'company_id',
      'name',
      'phone',
      'email',
      'supabase_user_id',
      'site_ids',
      'is_active',
      'pending_sms_approval_ids',
      'last_batch_sms_date',
      'verify_token',
      'created_at',
    ]);
    const selectMatches = [...ROUTE_SOURCE.matchAll(
      /from\('supervisors'\)\s*\n?\s*\.select\((['"`])([^'"`]+)\1\)/g,
    )];
    expect(selectMatches.length).toBeGreaterThan(0);
    for (const match of selectMatches) {
      const cols = match[2].split(',').map((c) => c.trim()).filter(Boolean);
      for (const col of cols) {
        expect(PRODUCTION_COLUMNS.has(col)).toBe(true);
      }
    }
  });

  it('cache-theatre directives stay removed in Stage 2', () => {
    // Stage 1 removed `export const dynamic = 'force-dynamic'` and
    // `export const revalidate = 0` because the bug was data-shape, not
    // caching. Stage 2 keeps them removed — Next.js 15+ defaults handle
    // this correctly when getCompanyIdForSession reads cookies().
    expect(ROUTE_SOURCE).not.toMatch(/^export\s+const\s+dynamic\s*=/m);
    expect(ROUTE_SOURCE).not.toMatch(/^export\s+const\s+revalidate\s*=/m);
  });
});

// --- Page-layer error-state guard ----------------------------------------
// Source-string assertions on the page component to pin the distinct error
// state introduced in Stage 1. Matches the visual-regression test pattern
// established at e0a58c4. (No React-renderer test infra exists in the
// project; source-string assertion is sufficient regression coverage.)

describe('Schema-drift guard — supervisors page distinct error state', () => {
  const PAGE_SOURCE = fs.readFileSync(
    path.join(process.cwd(), 'src/app/(command)/command/supervisors/page.tsx'),
    'utf-8',
  );

  it('captures HTTP non-OK responses into a distinct loadError state', () => {
    expect(PAGE_SOURCE).toMatch(/loadError/);
    expect(PAGE_SOURCE).toMatch(/setLoadError/);
  });

  it('renders an explicit error panel (role="alert") distinct from the empty state', () => {
    expect(PAGE_SOURCE).toMatch(/data-testid="supervisors-load-error"/);
    expect(PAGE_SOURCE).toMatch(/role="alert"/);
    expect(PAGE_SOURCE).toMatch(/Couldn[&'`]apos;t load supervisors/);
  });

  it('error panel uses the canonical review semantic tokens (CADA redesign)', () => {
    // Pre-redesign this asserted the raw rgba(217,165,72,0.55) amber
    // border. CADA replaces every per-page palette literal with the
    // semantic state tokens defined in src/styles/command-tokens.css —
    // a future palette tweak now updates every "review" surface at once.
    expect(PAGE_SOURCE).toMatch(/border:\s*'1px solid var\(--review-border\)'/);
    expect(PAGE_SOURCE).toMatch(/Retry/);
  });
});
