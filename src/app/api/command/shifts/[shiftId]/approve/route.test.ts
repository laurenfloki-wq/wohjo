// CRACK 218 — /api/command/shifts/[shiftId]/approve handler tests.
//
// Coverage per the 2026-05-11 dispatch WS5 list:
//   * Happy path: SUPERVISOR_APPROVED → writes PAYROLL_APPROVAL event, shifts
//     transitions to PAYROLL_APPROVED with payroll_approved_by = session userId
//   * Idempotency: replaying when already PAYROLL_APPROVED or EXPORTED
//   * Legacy detection: pre-CRACK-218 SUPERVISOR_APPROVAL layer=FINAL data
//     transitions shifts without inserting a duplicate event
//   * State guard: rejects shifts that are not SUPERVISOR_APPROVED
//   * Auth: non-admin rejected, cross-tenant rejected
//   * Chain integrity: previous_event_hash linked to latest v0 event
//   * Optimistic-lock miss: concurrent state flip is reported, not silently lost
//
// Pattern matches src/app/api/command/shifts/[shiftId]/correct/route.test.ts.

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
  authErrorResponse: vi
    .fn()
    .mockImplementation((err: { status?: number; message?: string; code?: string }) => {
      return new Response(
        JSON.stringify({
          success: false,
          error_code: err.code ?? 'AUTH',
          error_message: err.message ?? 'auth error',
        }),
        {
          status: err.status ?? 500,
          headers: { 'content-type': 'application/json' },
        },
      );
    }),
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
vi.mock('@/lib/wles/hash', () => ({
  generateEventHash: vi.fn().mockReturnValue('a'.repeat(64)),
}));
// WLES v1.0 — route now seals via crypto SHA-256 in @/lib/wles/v1.
// Mock sealEvent to a deterministic hash so the existing test
// assertions about event_hash hold without changing semantics.
vi.mock('@/lib/wles/v1', async () => {
  const actual = await vi.importActual<typeof import('@/lib/wles/v1')>('@/lib/wles/v1');
  return {
    ...actual,
    sealEvent: vi.fn().mockImplementation((unsealed) => ({
      ...unsealed,
      event_hash: 'a'.repeat(64),
    })),
  };
});

import { AuthorizationError } from '@/lib/auth/errors';
import { POST } from './route';

// ─── Fixtures ──────────────────────────────────────────────────────
// Valid v4 UUIDs (zod v4 nominal — we don't use zod here but using v4 UUIDs
// keeps fixtures interchangeable with sibling test files).
const COMPANY_TEST = '00000000-1000-4000-8000-000000000001';
const COMPANY_OTHER = '00000000-1000-4000-8000-000000000002';
const SHIFT_ID = '11111111-1111-4111-8111-111111111111';
const WORKER_ID = '22222222-2222-4222-8222-222222222222';
const SITE_ID = '33333333-3333-4333-8333-333333333333';
const ADMIN_USER_ID = '44444444-4444-4444-8444-444444444444';
const PRIOR_EVENT_HASH = 'b'.repeat(64);

interface ShiftFixture {
  id: string;
  company_id: string;
  worker_id: string;
  site_id: string | null;
  receipt_id: string;
  status: string;
  total_hours: string | null;
}

interface LegacyEventFixture {
  id: string;
  event_hash: string;
  event_data: Record<string, unknown> | null;
}

interface SetupOpts {
  shift: ShiftFixture | null;
  legacyFinal?: LegacyEventFixture | null;
  chainTail?: string | null;
  eventInsertError?: { message: string } | null;
  shiftUpdateError?: { message: string } | null;
  /** When true, the shifts UPDATE returns no row (optimistic-lock miss). */
  optimisticLockMiss?: boolean;
  /** Status to return on the post-miss re-read. */
  postMissStatus?: string;
}

function setupSupabase(opts: SetupOpts) {
  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<{ table: string; data: Record<string, unknown> }> = [];

  serviceMock.from.mockImplementation((table: string) => {
    if (table === 'shifts') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: opts.shift,
              error: opts.shift ? null : { message: 'not found' },
            }),
            // post-miss re-read uses maybeSingle
            maybeSingle: async () => ({
              data: opts.postMissStatus ? { id: SHIFT_ID, status: opts.postMissStatus } : null,
              error: null,
            }),
          }),
        }),
        update: (data: Record<string, unknown>) => {
          updates.push({ table: 'shifts', data });
          return {
            eq: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => ({
                    data: opts.optimisticLockMiss
                      ? null
                      : { id: SHIFT_ID, status: data.status as string },
                    error: opts.shiftUpdateError ?? null,
                  }),
                }),
              }),
            }),
          };
        },
      };
    }
    if (table === 'shift_events') {
      return {
        select: (cols: string) => {
          if (cols.trim() === 'event_hash') {
            // WLES v1 chain-tail lookup: .eq(company_id).eq(spec_version)
            //   .order(created_at).limit(1).maybeSingle()
            // For spec_version='1.0' we return the seeded chainTail (or
            // null which triggers bridge-event creation); for
            // spec_version='0' we return null so the bridge uses
            // ZERO_HASH as its from_chain_tail_hash.
            return {
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    // CRACK-219 legacy double-order path retained for
                    // any v0-style call sites — both shapes resolve.
                    order: () => ({
                      limit: () => ({
                        maybeSingle: async () => ({
                          data:
                            opts.chainTail !== undefined
                              ? opts.chainTail === null
                                ? null
                                : { event_hash: opts.chainTail }
                              : { event_hash: PRIOR_EVENT_HASH },
                          error: null,
                        }),
                      }),
                    }),
                    limit: () => ({
                      maybeSingle: async () => ({
                        data:
                          opts.chainTail !== undefined
                            ? opts.chainTail === null
                              ? null
                              : { event_hash: opts.chainTail }
                            : { event_hash: PRIOR_EVENT_HASH },
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          // legacy-detection lookup: id, event_hash, event_data
          return {
            eq: () => ({
              filter: () => ({
                filter: () => ({
                  order: () => ({
                    limit: async () => ({
                      data: opts.legacyFinal ? [opts.legacyFinal] : [],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        },
        insert: (row: Record<string, unknown>) => {
          inserts.push(row);
          // Two insert shapes coexist:
          //   1. v1-chain bridge: bare insert(...) awaited directly →
          //      resolves to { data: null, error: null }.
          //   2. insertV1Event: .insert(...).select('id').single() →
          //      single() returns { data: { id }, error }.
          // The error injected via opts.eventInsertError flows through
          // single() so insertV1Event throws with that message and the
          // route surfaces EVENT_INSERT_FAILED.
          const terminal = {
            select: (_cols: string) => ({
              single: async () => ({
                data: opts.eventInsertError ? null : { id: SHIFT_ID },
                error: opts.eventInsertError ?? null,
              }),
            }),
            then: (resolve: (v: { data: null; error: null }) => unknown) =>
              resolve({ data: null, error: null }),
          };
          return terminal;
        },
      };
    }
    throw new Error(`unexpected from(${table})`);
  });

  return { inserts, updates };
}

function buildRequest(): Request {
  return new Request(`http://test/api/command/shifts/${SHIFT_ID}/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': 'test-1' },
    body: JSON.stringify({}),
  });
}

const params = Promise.resolve({ shiftId: SHIFT_ID });

beforeEach(() => {
  authMock.mockReset();
  serviceMock.from.mockReset();
  authMock.mockResolvedValue({ userId: ADMIN_USER_ID, companyId: COMPANY_TEST, role: 'director' });
});

// ─── Happy paths ───────────────────────────────────────────────────

describe('POST /api/command/shifts/[shiftId]/approve — happy path', () => {
  it('writes PAYROLL_APPROVAL + transitions shift, with session-derived userId', async () => {
    const { inserts, updates } = setupSupabase({
      shift: {
        id: SHIFT_ID,
        company_id: COMPANY_TEST,
        worker_id: WORKER_ID,
        site_id: SITE_ID,
        receipt_id: 'FSTR-KMQ6479Q',
        status: 'SUPERVISOR_APPROVED',
        total_hours: '8.00',
      },
      chainTail: PRIOR_EVENT_HASH,
    });
    const res = await POST(buildRequest(), { params });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      success: boolean;
      status: string;
      shift_id: string;
      legacy_grandfathered?: boolean;
    };
    expect(body.success).toBe(true);
    expect(body.status).toBe('PAYROLL_APPROVED');
    expect(body.legacy_grandfathered).toBe(false);

    // Event inserted as the v1.0 X-FLOSMOSIS-PAYROLL_APPROVAL extension
    // event (CRACK 218 + M1 substrate migration). The legacy CRACK 218
    // pin — PAYROLL_APPROVAL is the FINAL approval, not SUPERVISOR — is
    // preserved through the prefixed event_type.
    expect(inserts).toHaveLength(1);
    const evt = inserts[0];
    expect(evt.event_type).toBe('X-FLOSMOSIS-PAYROLL_APPROVAL');
    expect(evt.previous_event_hash).toBe(PRIOR_EVENT_HASH);
    expect(evt.created_by).toBe(ADMIN_USER_ID);
    // Post-cutover M0 substrate CHECK forbids spec_version='0' inserts.
    expect(evt.spec_version).toBe('1.0');
    const evtData = evt.event_data as Record<string, unknown>;
    expect(evtData.shift_id).toBe(SHIFT_ID);
    expect(evtData.receipt_id).toBe('FSTR-KMQ6479Q');
    expect(evtData.approved_by_user_id).toBe(ADMIN_USER_ID);
    // CRACK 218: no `layer` field on PAYROLL_APPROVAL events
    expect(evtData.layer).toBeUndefined();

    // Shifts UPDATE uses session userId, not a client-supplied string
    const shiftUpdate = updates.find((u) => u.table === 'shifts');
    expect(shiftUpdate?.data.status).toBe('PAYROLL_APPROVED');
    expect(shiftUpdate?.data.payroll_approved_by).toBe(ADMIN_USER_ID);
    expect(shiftUpdate?.data.payroll_approved_by).not.toBe('payroll-admin');
  });

  it('chains genesis-style when worker has no prior v0 events', async () => {
    const { inserts } = setupSupabase({
      shift: {
        id: SHIFT_ID,
        company_id: COMPANY_TEST,
        worker_id: WORKER_ID,
        site_id: SITE_ID,
        receipt_id: 'FSTR-EMPTY001',
        status: 'SUPERVISOR_APPROVED',
        total_hours: '6.00',
      },
      chainTail: null,
    });
    const res = await POST(buildRequest(), { params });
    expect(res.status).toBe(200);
    // WLES v1.0 — when no prior v1 events exist for the company the
    // chain helper seals + inserts the bridge event first (genesis
    // linked to ZERO_HASH per Annex v2.1 §4c). The PAYROLL_APPROVAL
    // that follows chains off the bridge, so inserts[0] is the bridge
    // (previous_event_hash = ZERO_HASH) and inserts[1] is the approval
    // (previous_event_hash = bridge.event_hash).
    expect(inserts[0].previous_event_hash).toBe('0'.repeat(64));
    expect(inserts[0].event_type).toBe('X-FLOSMOSIS-SPEC_VERSION_MIGRATION');
    expect(inserts[1]?.event_type).toBe('X-FLOSMOSIS-PAYROLL_APPROVAL');
  });
});

// ─── Idempotency ────────────────────────────────────────────────────

describe('POST /api/command/shifts/[shiftId]/approve — idempotency', () => {
  it('returns 200 already_approved when shift is already PAYROLL_APPROVED', async () => {
    const { inserts, updates } = setupSupabase({
      shift: {
        id: SHIFT_ID,
        company_id: COMPANY_TEST,
        worker_id: WORKER_ID,
        site_id: SITE_ID,
        receipt_id: 'FSTR-ALREADY01',
        status: 'PAYROLL_APPROVED',
        total_hours: '8.00',
      },
    });
    const res = await POST(buildRequest(), { params });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { already_approved: boolean; status: string };
    expect(body.already_approved).toBe(true);
    expect(body.status).toBe('PAYROLL_APPROVED');
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it('returns 200 already_approved when shift is EXPORTED', async () => {
    const { inserts } = setupSupabase({
      shift: {
        id: SHIFT_ID,
        company_id: COMPANY_TEST,
        worker_id: WORKER_ID,
        site_id: SITE_ID,
        receipt_id: 'FSTR-EXPORTED1',
        status: 'EXPORTED',
        total_hours: '8.00',
      },
    });
    const res = await POST(buildRequest(), { params });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { already_approved: boolean; status: string };
    expect(body.already_approved).toBe(true);
    expect(body.status).toBe('EXPORTED');
    expect(inserts).toHaveLength(0);
  });
});

// ─── Legacy detection ──────────────────────────────────────────────

describe('POST /api/command/shifts/[shiftId]/approve — legacy detection', () => {
  it('grandfathers shifts with pre-CRACK-218 SUPERVISOR_APPROVAL layer=FINAL', async () => {
    const { inserts, updates } = setupSupabase({
      shift: {
        id: SHIFT_ID,
        company_id: COMPANY_TEST,
        worker_id: WORKER_ID,
        site_id: SITE_ID,
        receipt_id: 'FSTR-JRYMJXWR',
        status: 'SUPERVISOR_APPROVED',
        total_hours: '8.00',
      },
      legacyFinal: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        event_hash: 'c'.repeat(64),
        event_data: { shift_id: SHIFT_ID, layer: 'FINAL', method: 'PAYROLL_ADMIN' },
      },
    });
    const res = await POST(buildRequest(), { params });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { legacy_grandfathered: boolean; status: string };
    expect(body.legacy_grandfathered).toBe(true);
    expect(body.status).toBe('PAYROLL_APPROVED');

    // No new event inserted — legacy event is the chain record
    expect(inserts).toHaveLength(0);
    // But the shifts row IS transitioned
    expect(updates.find((u) => u.table === 'shifts')?.data.status).toBe('PAYROLL_APPROVED');
  });
});

// ─── State guard ───────────────────────────────────────────────────

describe('POST /api/command/shifts/[shiftId]/approve — state guard', () => {
  it('rejects 409 when shift is SUBMITTED', async () => {
    setupSupabase({
      shift: {
        id: SHIFT_ID,
        company_id: COMPANY_TEST,
        worker_id: WORKER_ID,
        site_id: SITE_ID,
        receipt_id: 'FSTR-SUB00001',
        status: 'SUBMITTED',
        total_hours: '8.00',
      },
    });
    const res = await POST(buildRequest(), { params });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error_code: string; error_message: string };
    expect(body.error_code).toBe('INVALID_STATE');
    expect(body.error_message).toContain('SUBMITTED');
  });

  it('rejects 409 when shift is IN_PROGRESS', async () => {
    setupSupabase({
      shift: {
        id: SHIFT_ID,
        company_id: COMPANY_TEST,
        worker_id: WORKER_ID,
        site_id: SITE_ID,
        receipt_id: 'FSTR-INPROG01',
        status: 'IN_PROGRESS',
        total_hours: null,
      },
    });
    const res = await POST(buildRequest(), { params });
    expect(res.status).toBe(409);
  });

  it('returns 404 if shift is not found', async () => {
    setupSupabase({ shift: null });
    const res = await POST(buildRequest(), { params });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error_code: string };
    expect(body.error_code).toBe('SHIFT_NOT_FOUND');
  });
});

// ─── Auth guard ────────────────────────────────────────────────────

describe('POST /api/command/shifts/[shiftId]/approve — auth guard', () => {
  it('returns 403 when caller is not an admin of the shift tenant', async () => {
    authMock.mockRejectedValueOnce(
      new AuthorizationError(
        403,
        'FORBIDDEN_COMPANY',
        'Admin is not a member of the target company.',
      ),
    );
    setupSupabase({
      shift: {
        id: SHIFT_ID,
        company_id: COMPANY_OTHER,
        worker_id: WORKER_ID,
        site_id: SITE_ID,
        receipt_id: 'FSTR-CROSS001',
        status: 'SUPERVISOR_APPROVED',
        total_hours: '8.00',
      },
    });
    const res = await POST(buildRequest(), { params });
    expect(res.status).toBe(403);
  });

  it('returns 401 when no session present', async () => {
    authMock.mockRejectedValueOnce(
      new AuthorizationError(401, 'UNAUTHENTICATED', 'Authentication required.'),
    );
    setupSupabase({
      shift: {
        id: SHIFT_ID,
        company_id: COMPANY_TEST,
        worker_id: WORKER_ID,
        site_id: SITE_ID,
        receipt_id: 'FSTR-NOAUTH01',
        status: 'SUPERVISOR_APPROVED',
        total_hours: '8.00',
      },
    });
    const res = await POST(buildRequest(), { params });
    expect(res.status).toBe(401);
  });
});

// ─── Concurrency / optimistic lock ─────────────────────────────────

describe('POST /api/command/shifts/[shiftId]/approve — concurrency', () => {
  it('reports already_approved on optimistic-lock miss with concurrent PAYROLL_APPROVED winner', async () => {
    setupSupabase({
      shift: {
        id: SHIFT_ID,
        company_id: COMPANY_TEST,
        worker_id: WORKER_ID,
        site_id: SITE_ID,
        receipt_id: 'FSTR-RACE0001',
        status: 'SUPERVISOR_APPROVED',
        total_hours: '8.00',
      },
      optimisticLockMiss: true,
      postMissStatus: 'PAYROLL_APPROVED',
    });
    const res = await POST(buildRequest(), { params });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { already_approved: boolean; status: string };
    expect(body.already_approved).toBe(true);
    expect(body.status).toBe('PAYROLL_APPROVED');
  });
});

// ─── Failure modes ─────────────────────────────────────────────────

describe('POST /api/command/shifts/[shiftId]/approve — failure modes', () => {
  it('returns structured 500 with error_code/error_message when event insert fails', async () => {
    setupSupabase({
      shift: {
        id: SHIFT_ID,
        company_id: COMPANY_TEST,
        worker_id: WORKER_ID,
        site_id: SITE_ID,
        receipt_id: 'FSTR-EVTERR01',
        status: 'SUPERVISOR_APPROVED',
        total_hours: '8.00',
      },
      eventInsertError: { message: 'duplicate key on shift_events_payroll_approval_unique' },
    });
    const res = await POST(buildRequest(), { params });
    expect(res.status).toBe(500);
    const body = (await res.json()) as {
      success: boolean;
      error_code: string;
      error_message: string;
    };
    expect(body.success).toBe(false);
    expect(body.error_code).toBe('EVENT_INSERT_FAILED');
    expect(body.error_message).toContain('duplicate key');
  });
});
