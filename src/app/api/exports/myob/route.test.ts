// /api/exports/myob — route tests.
//
// Source-string substrate + handler-invocation defensive coverage.
// Same hybrid pattern as src/app/api/admin/import/workers/route.test.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTE_SOURCE = readFileSync(
  join(process.cwd(), 'src/app/api/exports/myob/route.ts'),
  'utf-8',
);

// ─── Hoisted mocks ──────────────────────────────────────────────────

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn() },
}));

const { getCompanyIdForSessionMock, getApprovedShiftsMock } = vi.hoisted(() => ({
  getCompanyIdForSessionMock: vi.fn(),
  getApprovedShiftsMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => supabaseMock,
}));
vi.mock('@/lib/auth/session', () => ({
  getCompanyIdForSession: getCompanyIdForSessionMock,
}));
vi.mock('@/lib/auth/response', () => ({
  authErrorResponse: () =>
    new Response(JSON.stringify({ error: 'auth' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }),
}));
vi.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: () => ({ allowed: true }),
  getClientIP: () => '127.0.0.1',
  RATE_LIMITS: { EXPORT: { windowMs: 60_000, maxRequests: 60 } },
}));
vi.mock('@/lib/logger', () => ({
  routeLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
}));
vi.mock('@/lib/export/get-approved-shifts', () => ({
  getApprovedShifts: getApprovedShiftsMock,
}));
// MYOBExporter is real (no mock) — we want the route to exercise
// the actual class. The path-alias gap means we re-export it here
// via a relative-path mock that delegates to the real module.
vi.mock('@/lib/exporters/myob', async () => {
  const actual = await import('../../../../lib/exporters/myob');
  return actual;
});

import { POST } from './route';

const COMPANY_ID = '00000000-1000-0000-0000-00000000000a';
const WORKER_ID = '00000000-2000-0000-0000-00000000000a';

beforeEach(() => {
  vi.clearAllMocks();
  getCompanyIdForSessionMock.mockResolvedValue({ companyId: COMPANY_ID });
});

function setupSupabase(opts: {
  mappings?: Array<{ flostruction_category: string; myob_activity_id: string }>;
  workers?: Array<{ id: string; myob_card_id: string | null }>;
} = {}) {
  const mappings = opts.mappings ?? [
    { flostruction_category: 'ordinary_hours', myob_activity_id: 'CW2-ORD' },
  ];
  const workers = opts.workers ?? [{ id: WORKER_ID, myob_card_id: '*0001' }];

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'tenant_activity_mappings') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: mappings, error: null })),
        })),
      };
    }
    if (table === 'workers') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(() => Promise.resolve({ data: workers, error: null })),
          })),
        })),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });
}

// ─── Source-string substrate ───────────────────────────────────────

describe('exports/myob — source-string substrate', () => {
  it('1. uses canonical Class-A auth pattern (getCompanyIdForSession)', () => {
    expect(ROUTE_SOURCE).toMatch(/getCompanyIdForSession/);
  });

  it('2. rate-limited with EXPORT bucket (same as /api/command/export)', () => {
    expect(ROUTE_SOURCE).toMatch(/RATE_LIMITS\.EXPORT/);
  });

  it('3. validates pay_period_start + pay_period_end strict YYYY-MM-DD shape', () => {
    expect(ROUTE_SOURCE).toMatch(/\\d\{4\}-\\d\{2\}-\\d\{2\}/);
    expect(ROUTE_SOURCE).toMatch(/Dates must be YYYY-MM-DD/);
  });

  it('4. fetches mappings tenant-scoped via tenant_activity_mappings', () => {
    expect(ROUTE_SOURCE).toMatch(
      /\.from\(['"]tenant_activity_mappings['"]\)[\s\S]*?\.eq\(['"]tenant_id['"],\s*companyId\)/,
    );
  });

  it('5. fetches workers tenant-scoped (.eq company_id, companyId)', () => {
    expect(ROUTE_SOURCE).toMatch(
      /\.from\(['"]workers['"]\)[\s\S]*?\.eq\(['"]company_id['"],\s*companyId\)/,
    );
  });

  it('6. emits .txt extension (NOT .csv) per MYOB format spec', () => {
    expect(ROUTE_SOURCE).toMatch(/\.txt/);
    expect(ROUTE_SOURCE).not.toMatch(/\.csv['"]/);
  });

  it('7. returns warnings array (substrate-DD: never silently drop shifts)', () => {
    expect(ROUTE_SOURCE).toMatch(/warnings:\s*result\.warnings/);
  });

  it('8. surfaces the per-shift category derivation finding in a comment', () => {
    expect(ROUTE_SOURCE).toMatch(/SUBSTRATE-DD FINDING/);
    expect(ROUTE_SOURCE).toMatch(/category breakdown/);
  });
});

// ─── Defensive coverage ───────────────────────────────────────────

describe('exports/myob — defensive coverage', () => {
  it('9. happy path: returns 200 with content + filename + row_count', async () => {
    setupSupabase();
    getApprovedShiftsMock.mockResolvedValue([
      {
        id: 'shift-1',
        worker_id: WORKER_ID,
        worker_employee_id: 'DASS-001',
        worker_first_name: 'Joao',
        worker_last_name: 'Test',
        site_id: 'site-1',
        site_name: 'Stromlo Tunnel',
        company_id: COMPANY_ID,
        shift_date: '2026-05-05',
        start_time: '2026-05-05T07:00:00.000Z',
        end_time: '2026-05-05T15:30:00.000Z',
        break_minutes: 30,
        total_hours: 8,
        pay_rate: 28.47,
        status: 'PAYROLL_APPROVED',
        receipt_id: 'FSTR-MONTEST1',
        notes: '',
      },
    ]);

    const req = new Request('http://test/api/exports/myob', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pay_period_start: '2026-05-05',
        pay_period_end: '2026-05-11',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      content: string;
      filename: string;
      row_count: number;
      warnings: unknown[];
    };
    expect(json.row_count).toBe(1);
    expect(json.filename).toBe('Flostruction_MYOB_2026-05-05_to_2026-05-11.txt');
    expect(json.content).toContain('{}');
    expect(json.content).toContain('CW2-ORD');
    expect(json.content).toContain('*0001');
    expect(json.warnings).toEqual([]);
  });

  it('10. missing dates → 400', async () => {
    setupSupabase();
    const req = new Request('http://test/api/exports/myob', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('11. malformed dates → 400', async () => {
    setupSupabase();
    const req = new Request('http://test/api/exports/myob', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pay_period_start: '5/5/2026',
        pay_period_end: '11/5/2026',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(/YYYY-MM-DD/);
  });

  it('12. worker without myob_card_id → shift is SKIPPED with EMPTY_CARD_ID warning', async () => {
    setupSupabase({
      workers: [{ id: WORKER_ID, myob_card_id: null }],
    });
    getApprovedShiftsMock.mockResolvedValue([
      {
        id: 'shift-1',
        worker_id: WORKER_ID,
        worker_employee_id: 'DASS-001',
        worker_first_name: 'Joao',
        worker_last_name: 'Test',
        site_id: 'site-1',
        site_name: 'Stromlo Tunnel',
        company_id: COMPANY_ID,
        shift_date: '2026-05-05',
        start_time: '2026-05-05T07:00:00.000Z',
        end_time: '2026-05-05T15:30:00.000Z',
        break_minutes: 30,
        total_hours: 8,
        pay_rate: 28.47,
        status: 'PAYROLL_APPROVED',
        receipt_id: 'FSTR-MONTEST1',
        notes: '',
      },
    ]);
    const req = new Request('http://test/api/exports/myob', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pay_period_start: '2026-05-05',
        pay_period_end: '2026-05-11',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      row_count: number;
      warnings: Array<{ reason: string }>;
    };
    expect(json.row_count).toBe(0);
    expect(json.warnings.length).toBe(1);
    expect(json.warnings[0].reason).toBe('EMPTY_CARD_ID');
  });

  it('13. tenant with no mappings yet → all shifts skipped with NO_MAPPING warning', async () => {
    setupSupabase({ mappings: [] });
    getApprovedShiftsMock.mockResolvedValue([
      {
        id: 'shift-1',
        worker_id: WORKER_ID,
        worker_employee_id: 'DASS-001',
        worker_first_name: 'Joao',
        worker_last_name: 'Test',
        site_id: 'site-1',
        site_name: 'Stromlo Tunnel',
        company_id: COMPANY_ID,
        shift_date: '2026-05-05',
        start_time: '2026-05-05T07:00:00.000Z',
        end_time: '2026-05-05T15:30:00.000Z',
        break_minutes: 30,
        total_hours: 8,
        pay_rate: 28.47,
        status: 'PAYROLL_APPROVED',
        receipt_id: 'FSTR-MONTEST1',
        notes: '',
      },
    ]);
    const req = new Request('http://test/api/exports/myob', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pay_period_start: '2026-05-05',
        pay_period_end: '2026-05-11',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      row_count: number;
      warnings: Array<{ reason: string }>;
    };
    expect(json.row_count).toBe(0);
    expect(json.warnings[0].reason).toBe('NO_MAPPING');
  });

  it('14. empty pay period → 200 with marker + header + 0 data rows + no warnings', async () => {
    setupSupabase();
    getApprovedShiftsMock.mockResolvedValue([]);
    const req = new Request('http://test/api/exports/myob', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pay_period_start: '2026-05-05',
        pay_period_end: '2026-05-11',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      content: string;
      row_count: number;
      warnings: unknown[];
    };
    expect(json.row_count).toBe(0);
    expect(json.content.startsWith('{}')).toBe(true);
    expect(json.warnings).toEqual([]);
  });
});
