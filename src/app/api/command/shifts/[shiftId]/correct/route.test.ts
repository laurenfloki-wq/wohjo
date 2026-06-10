// /api/command/shifts/[shiftId]/correct — Phase 1 corrective-event endpoint test.
//
// Coverage:
//   - happy path: CORRECTION, BUG_CORRECTION, SUPERVISOR_RE_APPROVAL all
//     produce a 201 with sealed event id + extended hash chain
//   - tenant isolation: parent_shift_event_id from another tenant => 403
//   - shift not found => 404
//   - parent event not found => 404
//   - bad payload (invalid type, empty reason, missing parent) => 400
//   - DB insert error => 500
//
// Pattern matches src/app/api/command/supervisors/route.test.ts —
// hoisted vi.mock for supabase + auth helpers, query-builder mock.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { authMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
}));

const { serviceMock } = vi.hoisted(() => ({
  serviceMock: { from: vi.fn() },
}));

vi.mock('@/lib/auth/session', () => ({
  requireCompanyMembership: authMock,
}));
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockReturnValue(serviceMock),
}));
vi.mock('@/lib/auth/response', () => ({
  authErrorResponse: vi.fn().mockImplementation((err: { status?: number; message?: string }) => ({
    status: err.status ?? 500,
    json: async () => ({ error: err.message ?? 'auth error' }),
  })),
}));
vi.mock('@/lib/logger', () => ({
  routeLogger: vi.fn().mockReturnValue({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn(),
  }),
}));
vi.mock('@/lib/wles/hash', () => ({
  generateEventHash: vi.fn().mockReturnValue('a'.repeat(64)),
}));

import { POST } from './route';

// Valid v4 UUIDs (zod v4 requires version-bit + variant-bit conformance for
// z.string().uuid()): third group must start with 4, fourth group must
// start with 8/9/a/b. Tenant ids are arbitrary strings inside the mock —
// only parent_shift_event_id flows through zod validation.
const TENANT_TEST = '00000000-1000-0000-0000-000000000001';
const TENANT_OTHER = '22222222-0000-0000-0000-000000000002';
const SHIFT_ID = '11111111-1111-4111-8111-111111111111';
const PARENT_EVENT_ID = '33333333-3333-4333-8333-333333333333';
const NEW_EVENT_ID = '44444444-4444-4444-8444-444444444444';
const ADMIN_USER_ID = 'auth-admin-1';

interface ShiftFixture {
  id: string;
  company_id: string;
  worker_id: string;
  site_id: string;
  receipt_id: string | null;
}

interface ParentEventFixture {
  id: string;
  company_id: string;
  worker_id: string;
  site_id: string;
  event_hash: string;
}

interface InsertCapture { rows: unknown[] }

interface FixtureOptions {
  shift: ShiftFixture | null;
  parentEvent: ParentEventFixture | null;
  insertError?: { message: string } | null;
  insertedId?: string;
  lastEventHash?: string | null;
}

function configureSupabase(opts: FixtureOptions): InsertCapture {
  const inserts: unknown[] = [];

  serviceMock.from.mockImplementation((table: string) => {
    if (table === 'shifts') {
      // CP-1 slice 2b: shifts is read twice — shiftAuthLookup
      // (.eq('id').single()) and the scoped getForCorrect re-read
      // (.eq('id').eq('company_id').single()). Self-chaining eq serves
      // both; behaviour assertions are unchanged.
      type EqNode = {
        eq: () => EqNode;
        single: () => Promise<{ data: ShiftFixture | null; error: { message: string } | null }>;
      };
      const eqNode: EqNode = {
        eq: () => eqNode,
        single: async () => ({
          data: opts.shift,
          error: opts.shift ? null : { message: 'not found' },
        }),
      };
      return {
        select: () => ({
          eq: () => eqNode,
        }),
      };
    }
    if (table === 'shift_events') {
      return {
        select: (cols: string) => {
          if (cols.replace(/\s+/g, '') === 'id,company_id') {
            // parent event lookup — column-minimised to id + company_id
            // by the parentEventAuthLookup seam (CP-1 slice 2b)
            return {
              eq: () => ({
                single: async () => ({
                  data: opts.parentEvent,
                  error: opts.parentEvent ? null : { message: 'not found' },
                }),
              }),
            };
          }
          if (cols.trim() === 'event_hash') {
            // chain tail lookup
            return {
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    single: async () => ({
                      data: opts.lastEventHash !== undefined
                        ? { event_hash: opts.lastEventHash }
                        : { event_hash: 'b'.repeat(64) },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          // insert().select('id, event_hash').single() — handled below
          return {
            single: async () => ({
              data: opts.insertError ? null : { id: opts.insertedId ?? NEW_EVENT_ID, event_hash: 'a'.repeat(64) },
              error: opts.insertError ?? null,
            }),
          };
        },
        insert: (rows: unknown) => {
          inserts.push(rows);
          return {
            select: (_cols: string) => ({
              single: async () => ({
                data: opts.insertError ? null : { id: opts.insertedId ?? NEW_EVENT_ID, event_hash: 'a'.repeat(64) },
                error: opts.insertError ?? null,
              }),
            }),
          };
        },
      };
    }
    throw new Error(`unexpected from(${table})`);
  });

  return { rows: inserts };
}

function buildRequest(body: unknown): Request {
  return new Request(`http://test/api/command/shifts/${SHIFT_ID}/correct`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': 'test-1' },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ shiftId: SHIFT_ID });

beforeEach(() => {
  authMock.mockReset();
  serviceMock.from.mockReset();
  authMock.mockResolvedValue({ userId: ADMIN_USER_ID, companyId: TENANT_TEST, role: 'director' });
});

describe('POST /api/command/shifts/[shiftId]/correct — happy paths', () => {
  it.each([
    ['CORRECTION'],
    ['BUG_CORRECTION'],
    ['SUPERVISOR_RE_APPROVAL'],
  ])('records a %s and returns 201 with chain extension', async (correctionType) => {
    const capture = configureSupabase({
      shift: { id: SHIFT_ID, company_id: TENANT_TEST, worker_id: 'w-1', site_id: 's-1', receipt_id: 'r-1' },
      parentEvent: { id: PARENT_EVENT_ID, company_id: TENANT_TEST, worker_id: 'w-1', site_id: 's-1', event_hash: 'b'.repeat(64) },
      lastEventHash: 'b'.repeat(64),
    });

    const res = await POST(buildRequest({
      correction_type: correctionType,
      parent_shift_event_id: PARENT_EVENT_ID,
      correction_reason: 'Worker disputed hours; admin verified via timesheet photos.',
    }), { params });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { success: boolean; correction: { event_hash: string; previous_event_hash: string | null; correction_type: string; parent_shift_event_id: string } };
    expect(body.success).toBe(true);
    expect(body.correction.correction_type).toBe(correctionType);
    expect(body.correction.parent_shift_event_id).toBe(PARENT_EVENT_ID);
    expect(body.correction.previous_event_hash).toBe('b'.repeat(64));
    expect(body.correction.event_hash).toBe('a'.repeat(64));

    // Insert payload sanity
    expect(capture.rows).toHaveLength(1);
    const inserted = capture.rows[0] as Record<string, unknown>;
    expect(inserted.event_type).toBe(correctionType);
    expect(inserted.parent_shift_event_id).toBe(PARENT_EVENT_ID);
    expect(inserted.correction_reason).toMatch(/Worker disputed hours/);
    expect(inserted.created_by).toBe(ADMIN_USER_ID);
    expect(inserted.previous_event_hash).toBe('b'.repeat(64));
    expect(inserted.company_id).toBe(TENANT_TEST);
  });
});

describe('POST /api/command/shifts/[shiftId]/correct — invariants', () => {
  it('returns 404 if shift not found', async () => {
    configureSupabase({ shift: null, parentEvent: null });
    const res = await POST(buildRequest({
      correction_type: 'CORRECTION',
      parent_shift_event_id: PARENT_EVENT_ID,
      correction_reason: 'test',
    }), { params });
    expect(res.status).toBe(404);
  });

  it('returns 404 if parent_shift_event_id not found', async () => {
    configureSupabase({
      shift: { id: SHIFT_ID, company_id: TENANT_TEST, worker_id: 'w-1', site_id: 's-1', receipt_id: 'r-1' },
      parentEvent: null,
    });
    const res = await POST(buildRequest({
      correction_type: 'CORRECTION',
      parent_shift_event_id: PARENT_EVENT_ID,
      correction_reason: 'test',
    }), { params });
    expect(res.status).toBe(404);
  });

  it('returns 403 when parent event belongs to a different tenant (cross-tenant guard)', async () => {
    configureSupabase({
      shift: { id: SHIFT_ID, company_id: TENANT_TEST, worker_id: 'w-1', site_id: 's-1', receipt_id: 'r-1' },
      parentEvent: { id: PARENT_EVENT_ID, company_id: TENANT_OTHER, worker_id: 'w-1', site_id: 's-1', event_hash: 'c'.repeat(64) },
    });
    const res = await POST(buildRequest({
      correction_type: 'CORRECTION',
      parent_shift_event_id: PARENT_EVENT_ID,
      correction_reason: 'test',
    }), { params });
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid correction_type enum', async () => {
    configureSupabase({
      shift: { id: SHIFT_ID, company_id: TENANT_TEST, worker_id: 'w-1', site_id: 's-1', receipt_id: 'r-1' },
      parentEvent: { id: PARENT_EVENT_ID, company_id: TENANT_TEST, worker_id: 'w-1', site_id: 's-1', event_hash: 'b'.repeat(64) },
    });
    const res = await POST(buildRequest({
      correction_type: 'NOT_A_VALID_TYPE',
      parent_shift_event_id: PARENT_EVENT_ID,
      correction_reason: 'test',
    }), { params });
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty correction_reason', async () => {
    configureSupabase({
      shift: { id: SHIFT_ID, company_id: TENANT_TEST, worker_id: 'w-1', site_id: 's-1', receipt_id: 'r-1' },
      parentEvent: { id: PARENT_EVENT_ID, company_id: TENANT_TEST, worker_id: 'w-1', site_id: 's-1', event_hash: 'b'.repeat(64) },
    });
    const res = await POST(buildRequest({
      correction_type: 'CORRECTION',
      parent_shift_event_id: PARENT_EVENT_ID,
      correction_reason: '',
    }), { params });
    expect(res.status).toBe(400);
  });

  it('returns 400 for malformed JSON body', async () => {
    const req = new Request(`http://test/api/command/shifts/${SHIFT_ID}/correct`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
  });

  it('returns 500 when DB insert fails', async () => {
    configureSupabase({
      shift: { id: SHIFT_ID, company_id: TENANT_TEST, worker_id: 'w-1', site_id: 's-1', receipt_id: 'r-1' },
      parentEvent: { id: PARENT_EVENT_ID, company_id: TENANT_TEST, worker_id: 'w-1', site_id: 's-1', event_hash: 'b'.repeat(64) },
      insertError: { message: 'check constraint shift_events_correction_consistency_check violated' },
    });
    const res = await POST(buildRequest({
      correction_type: 'CORRECTION',
      parent_shift_event_id: PARENT_EVENT_ID,
      correction_reason: 'test',
    }), { params });
    expect(res.status).toBe(500);
  });
});
