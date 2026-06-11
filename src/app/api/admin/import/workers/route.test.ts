// Monday Task 6 — bulk worker CSV import tests.
//
// Source-string + handler-invocation hybrid following the existing
// records.test.ts pattern. Auth + Supabase are mocked; the parser
// logic is exercised via real handler calls.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTE_SOURCE = readFileSync(
  join(process.cwd(), 'src/app/api/admin/import/workers/route.ts'),
  'utf-8',
);

// ─── Hoisted mocks ──────────────────────────────────────────────────

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
  },
}));

const { getCompanyIdForSessionMock } = vi.hoisted(() => ({
  getCompanyIdForSessionMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => supabaseMock,
}));
vi.mock('@/lib/auth/session', () => ({
  getCompanyIdForSession: getCompanyIdForSessionMock,
}));
vi.mock('@/lib/auth/response', () => ({
  authErrorResponse: (err: unknown) => {
    const status =
      err && typeof err === 'object' && 'status' in err
        ? Number((err as { status: unknown }).status) || 401
        : 401;
    return new Response(JSON.stringify({ error: 'auth' }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  },
}));
vi.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: () => ({ allowed: true }),
  getClientIP: () => '127.0.0.1',
}));
vi.mock('@/lib/logger', () => ({
  routeLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
}));

import { POST } from './route';

const COMPANY_ID = '00000000-1000-0000-0000-000000000001';

// Build a chainable mock for the workers table that supports the two
// query shapes the route uses: pre-flight duplicate check (`.from →
// .select → .eq → .in`) and bulk insert (`.from → .insert → .select`).
function setupSupabaseMocks(opts: {
  existingPhones?: string[];
  insertError?: { message: string } | null;
} = {}) {
  const { existingPhones = [], insertError = null } = opts;

  supabaseMock.from.mockImplementation((table: string) => {
    if (table !== 'workers') {
      throw new Error(`unexpected table: ${table}`);
    }
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() =>
            Promise.resolve({
              data: existingPhones.map((p) => ({ phone: p })),
              error: null,
            }),
          ),
        })),
      })),
      insert: vi.fn((rows: Array<Record<string, unknown>>) => ({
        select: vi.fn(() =>
          Promise.resolve(
            insertError
              ? { data: null, error: insertError }
              : {
                  data: rows.map((r, i) => ({
                    id: `00000000-9000-0000-0000-${String(i).padStart(12, '0')}`,
                    first_name: r.first_name,
                    last_name: r.last_name,
                    phone: r.phone,
                    employee_id: r.employee_id,
                  })),
                  error: null,
                },
          ),
        ),
      })),
    };
  });
}

const VALID_HEADER =
  'first_name,last_name,phone,super_fund,abn,award_classification,pay_rate,employee_id';

const VALID_CSV =
  VALID_HEADER +
  '\nJoao,Test,+61400000001,AustralianSuper,,CW3,28.47,DASS-001' +
  '\nWorker,Two,0400000002,REST,,,30.50,DASS-002';

beforeEach(() => {
  vi.clearAllMocks();
  getCompanyIdForSessionMock.mockResolvedValue({ companyId: COMPANY_ID });
});

describe('admin/import/workers — source-string substrate', () => {
  it('derives company_id server-side via getCompanyIdForSession (GAP-A3-001 closure)', () => {
    expect(ROUTE_SOURCE).toMatch(/getCompanyIdForSession/);
  });

  it('rate-limits bulk import (10/hour per IP)', () => {
    expect(ROUTE_SOURCE).toMatch(/checkRateLimit\(`admin\.import\.workers/);
    expect(ROUTE_SOURCE).toMatch(/maxRequests:\s*10/);
  });

  it('caps CSV size at 1MB to prevent DoS', () => {
    expect(ROUTE_SOURCE).toMatch(/1_048_576/);
    expect(ROUTE_SOURCE).toMatch(/CSV too large/);
  });

  it('inserts company_id from session into every row (tenant-scoping invariant)', () => {
    // W1.4 (2026-06-10): the company_id mapping relocated into
    // workersRepo.bulkCreate's binding — assert both halves (S9).
    const REPO_SOURCE = readFileSync(
      join(process.cwd(), 'src/lib/db/repositories/workers.repo.ts'),
      'utf-8',
    );
    expect(ROUTE_SOURCE).toMatch(/workersRepo\(companyId\)/);
    expect(REPO_SOURCE).toMatch(/company_id:\s*companyId/);
  });

  it('does NOT read company_id from the request body', () => {
    // Body parse only extracts `csv` field. company_id from body
    // would be a tenant-scoping violation.
    expect(ROUTE_SOURCE).not.toMatch(/body\.company_id/);
  });
});

describe('admin/import/workers — happy path', () => {
  it('imports valid CSV and returns inserted workers', async () => {
    setupSupabaseMocks();
    const req = new Request('http://test/api/admin/import/workers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ csv: VALID_CSV }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = (await res.json()) as { imported: number };
    expect(json.imported).toBe(2);
  });

  it('normalises 0XXXXXXXXX phone to +61 format', async () => {
    setupSupabaseMocks();
    let capturedRows: Array<Record<string, unknown>> = [];
    supabaseMock.from.mockImplementationOnce(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
    }));
    supabaseMock.from.mockImplementationOnce(() => ({
      insert: vi.fn((rows: Array<Record<string, unknown>>) => {
        capturedRows = rows;
        return {
          select: vi.fn(() =>
            Promise.resolve({ data: rows, error: null }),
          ),
        };
      }),
    }));

    const csv =
      VALID_HEADER +
      '\nWorker,One,0400000099,AusSuper,,CW3,28.47,DASS-099';
    const req = new Request('http://test/api/admin/import/workers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ csv }),
    });
    await POST(req);
    expect(capturedRows[0]?.phone).toBe('+61400000099');
  });
});

describe('admin/import/workers — validation errors', () => {
  it('rejects missing csv field', async () => {
    setupSupabaseMocks();
    const req = new Request('http://test/api/admin/import/workers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects header mismatch', async () => {
    setupSupabaseMocks();
    const csv = 'name,phone,pay_rate\nJoao,+61400000001,28.47';
    const req = new Request('http://test/api/admin/import/workers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ csv }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { details?: string[] };
    expect(json.details?.[0]).toMatch(/Header mismatch/);
  });

  it('rejects unparseable phone', async () => {
    setupSupabaseMocks();
    const csv =
      VALID_HEADER + '\nJoao,Test,not-a-phone,AS,,CW3,28.47,DASS-001';
    const req = new Request('http://test/api/admin/import/workers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ csv }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { details?: string[] };
    expect(json.details?.[0]).toMatch(/not a valid Australian mobile/);
  });

  it('rejects pay_rate out of bounds', async () => {
    setupSupabaseMocks();
    const csv =
      VALID_HEADER +
      '\nJoao,Test,+61400000001,AS,,CW3,9999.99,DASS-001';
    const req = new Request('http://test/api/admin/import/workers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ csv }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { details?: string[] };
    expect(json.details?.[0]).toMatch(/pay_rate.*must be between/);
  });

  it('rejects CSV with only header (no data rows)', async () => {
    setupSupabaseMocks();
    const req = new Request('http://test/api/admin/import/workers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ csv: VALID_HEADER }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(/No worker rows/);
  });

  it('blocks duplicate phone within tenant (no partial inserts)', async () => {
    setupSupabaseMocks({ existingPhones: ['+61400000001'] });
    const req = new Request('http://test/api/admin/import/workers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ csv: VALID_CSV }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const json = (await res.json()) as { duplicates?: string[] };
    expect(json.duplicates).toContain('+61400000001');
  });

  it('returns ALL parse errors at once, no partial imports', async () => {
    setupSupabaseMocks();
    const csv =
      VALID_HEADER +
      '\nJoao,Test,bad-phone,AS,,CW3,28.47,DASS-001' +
      '\nMary,Test,+61400000002,AS,,CW3,9999.99,DASS-002';
    const req = new Request('http://test/api/admin/import/workers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ csv }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { details?: string[] };
    expect(json.details?.length).toBe(2);
  });
});
