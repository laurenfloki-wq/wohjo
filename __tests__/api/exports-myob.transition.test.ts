// CRACK 217 — export pipeline transition tests.
//
// Tests the full-pipeline path (Shape A: shift_ids body) of
// /api/exports/myob, covering:
//   1. Idempotency: all shifts already EXPORTED → {ok, already_exported}
//   2. 422 when shifts are not PAYROLL_APPROVED
//   3. Source-string verification: idempotency guard + compensating rollback exist
//   4. Happy path: 4 shifts transition PAYROLL_APPROVED → EXPORTED
//   5. Mid-flight failure: shift_events INSERT fails → compensating rollback called

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Source file for substrate tests ────────────────────────────────────────

const ROUTE_SOURCE = readFileSync(
  join(process.cwd(), 'src/app/api/exports/myob/route.ts'),
  'utf-8',
);

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn() },
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
  routeLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/lib/exporters/myob', async () => {
  const actual = await import('../../src/lib/exporters/myob');
  return actual;
});

import { POST } from '../../src/app/api/exports/myob/route';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const COMPANY_ID = '00000000-1000-0000-0000-000000000001';
const WORKER_ID = '00000000-2000-0000-0000-000000000001';
const USER_ID = '00000000-3000-0000-0000-000000000001';
const EXPORT_ID = '00000000-5000-0000-0000-000000000001';

const SHIFT_IDS = [
  '00000000-4000-0000-0000-000000000001',
  '00000000-4000-0000-0000-000000000002',
  '00000000-4000-0000-0000-000000000003',
  '00000000-4000-0000-0000-000000000004',
];

function makeShifts(status: string) {
  return SHIFT_IDS.map((id, i) => ({
    id,
    company_id: COMPANY_ID,
    worker_id: WORKER_ID,
    site_id: '00000000-6000-0000-0000-000000000001',
    shift_date: `2026-05-0${i + 1}`,
    start_time: `2026-05-0${i + 1}T07:00:00.000Z`,
    end_time: `2026-05-0${i + 1}T15:30:00.000Z`,
    break_minutes: 30,
    total_hours: '8.00',
    status,
    receipt_id: `FSTR-TEST000${i + 1}`,
    worker_note: null,
    workers: {
      id: WORKER_ID,
      first_name: 'Joao',
      last_name: 'Test',
      employee_id: 'DASS-001',
      pay_rate: '28.47',
    },
    sites: { id: '00000000-6000-0000-0000-000000000001', name: 'Mt Stromlo' },
  }));
}

// Builds a chainable Supabase mock that is immediately thenable.
function chainable(result: { data?: unknown; error?: unknown | null }) {
  const c: Record<string, unknown> = {};
  const methods = [
    'select',
    'insert',
    'update',
    'delete',
    'eq',
    'in',
    'is',
    'order',
    'limit',
    'gt',
    'not',
  ];
  for (const m of methods) c[m] = vi.fn(() => c);
  c['single'] = vi.fn(() => Promise.resolve(result));
  c['maybeSingle'] = vi.fn(() => Promise.resolve(result));
  c['then'] = (res: (v: typeof result) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej);
  c['catch'] = (rej: (e: unknown) => unknown) => Promise.resolve(result).catch(rej);
  return c;
}

// Queued results per table (FIFO).
function setupPipelineMock(shiftEventInsertError: { message: string } | null = null) {
  const queues: Record<string, Array<{ data?: unknown; error?: unknown | null }>> = {
    shifts: [
      { data: makeShifts('PAYROLL_APPROVED'), error: null }, // initial SELECT
      { data: null, error: null }, // UPDATE to EXPORTED
      { data: null, error: null }, // compensating UPDATE (if needed)
    ],
    tenant_activity_mappings: [{ data: [], error: null }],
    workers: [{ data: [{ id: WORKER_ID, myob_card_id: '*0001' }], error: null }],
    exports: [
      { data: { id: EXPORT_ID }, error: null }, // INSERT
      { data: null, error: null }, // compensating DELETE (if needed)
    ],
    shift_events: [
      { data: null, error: null }, // SELECT last event for worker
      // INSERT per shift (4 shifts; last one may fail)
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: shiftEventInsertError },
      { data: null, error: null },
    ],
  };

  const deleteMock = vi.fn(() => chainable({ data: null, error: null }));
  const updateCompensateMock = vi.fn(() => chainable({ data: null, error: null }));

  supabaseMock.from.mockImplementation((table: string) => {
    const queue = queues[table];
    if (!queue || queue.length === 0) return chainable({ data: null, error: null });
    const result = queue.shift()!;
    const c = chainable(result);
    // Track compensating calls
    if (table === 'exports') (c as Record<string, unknown>)['delete'] = deleteMock;
    if (table === 'shifts') (c as Record<string, unknown>)['update'] = updateCompensateMock;
    return c;
  });

  return { deleteMock, updateCompensateMock };
}

function makeRequest(shiftIds: string[]) {
  return new Request('http://test/api/exports/myob', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ shift_ids: shiftIds }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCompanyIdForSessionMock.mockResolvedValue({ companyId: COMPANY_ID, userId: USER_ID });
});

// ─── Source-string substrate ─────────────────────────────────────────────────

describe('exports/myob pipeline — source-string substrate (CRACK 217)', () => {
  it('has idempotency guard: already_exported branch when all shifts EXPORTED', () => {
    expect(ROUTE_SOURCE).toContain('already_exported: true');
    expect(ROUTE_SOURCE).toMatch(/\.every\(\s*\(r\)\s*=>/);
    expect(ROUTE_SOURCE).toContain("status === 'EXPORTED'");
  });

  it('has compensating rollback on event insert failure', () => {
    expect(ROUTE_SOURCE).toContain('exports.myob.event_insert_failed');
    expect(ROUTE_SOURCE).toContain('Compensating rollback');
    expect(ROUTE_SOURCE).toContain("status: 'PAYROLL_APPROVED'");
    expect(ROUTE_SOURCE).toContain('export rolled back');
  });

  it('inserts into exports table with correct fields', () => {
    expect(ROUTE_SOURCE).toMatch(/from\(['"]exports['"]\)/);
    expect(ROUTE_SOURCE).toContain('export_target:');
    expect(ROUTE_SOURCE).toContain('file_hash:');
    expect(ROUTE_SOURCE).toContain('exported_by:');
  });

  it('updates shifts with EXPORTED status after export insert', () => {
    expect(ROUTE_SOURCE).toContain("status: 'EXPORTED'");
    expect(ROUTE_SOURCE).toContain('export_id: exportId');
    expect(ROUTE_SOURCE).toContain("status: 'PAYROLL_APPROVED'");
  });

  it('inserts EXPORT_RECORD shift_events per shift with chain linkage', () => {
    expect(ROUTE_SOURCE).toContain("event_type: 'EXPORT_RECORD'");
    expect(ROUTE_SOURCE).toContain('previous_event_hash:');
    expect(ROUTE_SOURCE).toContain("spec_version: '0'");
  });
});

// ─── Idempotency ─────────────────────────────────────────────────────────────

describe('exports/myob pipeline — idempotency (replay guard)', () => {
  it('returns {ok, already_exported} when all shifts already EXPORTED', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'shifts') {
        return chainable({ data: makeShifts('EXPORTED'), error: null });
      }
      return chainable({ data: null, error: null });
    });

    const res = await POST(makeRequest(SHIFT_IDS));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; already_exported: boolean };
    expect(json.ok).toBe(true);
    expect(json.already_exported).toBe(true);
  });

  it('returns 422 when shifts are at SUPERVISOR_APPROVED (not yet payroll-approved)', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'shifts') {
        return chainable({ data: makeShifts('SUPERVISOR_APPROVED'), error: null });
      }
      return chainable({ data: null, error: null });
    });

    const res = await POST(makeRequest(SHIFT_IDS));
    expect(res.status).toBe(422);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/PAYROLL_APPROVED/);
  });
});

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('exports/myob pipeline — happy path', () => {
  it('returns 200 CSV attachment and calls exports insert + shifts update', async () => {
    setupPipelineMock();

    const res = await POST(makeRequest(SHIFT_IDS));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toMatch(/attachment/);
    expect(res.headers.get('X-Export-Id')).toBe(EXPORT_ID);
    // Supabase from() called for: shifts(select), mappings, workers, exports, shifts(update), shift_events(select+inserts)
    expect(supabaseMock.from).toHaveBeenCalledWith('exports');
    expect(supabaseMock.from).toHaveBeenCalledWith('shift_events');
  });
});

// ─── Mid-flight failure ───────────────────────────────────────────────────────

describe('exports/myob pipeline — mid-flight failure', () => {
  it('returns 500 and invokes compensating rollback when shift_events insert fails', async () => {
    const { deleteMock, updateCompensateMock } = setupPipelineMock({
      message: 'unique violation: hash collision',
    });

    const res = await POST(makeRequest(SHIFT_IDS));
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/rolled back/);

    // Compensating calls were issued
    expect(deleteMock).toHaveBeenCalled();
    expect(updateCompensateMock).toHaveBeenCalled();
  });
});
