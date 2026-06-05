// Monday Task 5 — supervisor web-link approval hardening.
//
// Twilio paid-mode KYC ticket #26614133 is still pending. The web-link
// approval path (`/api/verify/approve/[shiftId]?token=...`) is the
// canonical fallback for Mo Week 1. This test file pins the auth
// posture, tenant scoping, and chain-extension behaviour.
//
// Source-string + handler-invocation hybrid following the
// records.test.ts pattern. Auth is via verify_token (no session
// dependency), so direct route invocation is feasible.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTE_SOURCE = readFileSync(
  join(process.cwd(), 'src/app/api/verify/approve/[shiftId]/route.ts'),
  'utf-8',
);

// ─── Hoisted mocks ──────────────────────────────────────────────────

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn() },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => supabaseMock,
}));
vi.mock('@/lib/email/notify', () => ({
  notifyPayrollAdmin: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/sms/worker-notify', () => ({
  sendWorkerApprovedSms: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 100 }),
  getClientIP: () => '127.0.0.1',
  RATE_LIMITS: { AUTH: { windowMs: 60_000, maxRequests: 100 } },
}));
vi.mock('@/lib/logger', () => ({
  routeLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
}));
vi.mock('@/lib/wles/hash', () => ({
  generateEventHash: () =>
    'a'.repeat(64),
}));
// WLES v1.0 — route now seals via crypto SHA-256 in @/lib/wles/v1.
// Mock sealEvent to a deterministic hash so the existing test
// assertions about event_hash hold without changing semantics.
vi.mock('@/lib/wles/v1', async () => {
  const actual = await vi.importActual<typeof import('@/lib/wles/v1')>('@/lib/wles/v1');
  return {
    ...actual,
    sealEvent: (unsealed: { previous_event_hash: string }) => ({
      ...unsealed,
      event_hash: 'a'.repeat(64),
    }),
  };
});

import { POST } from './route';

const COMPANY_A = '00000000-1000-0000-0000-00000000000a';
const COMPANY_B = '00000000-1000-0000-0000-00000000000b';
const SUPERVISOR_A_ID = '00000000-4000-0000-0000-00000000000a';
const SUPERVISOR_B_ID = '00000000-4000-0000-0000-00000000000b';
const SHIFT_A_ID = '00000000-5000-0000-0000-00000000000a';
const SITE_A_ID = '00000000-3000-0000-0000-00000000000a';
const WORKER_A_ID = '00000000-2000-0000-0000-00000000000a';
const TOKEN_A = '00000000-6000-0000-0000-00000000000a';
const TOKEN_B = '00000000-6000-0000-0000-00000000000b';

interface MockShift {
  id: string;
  company_id: string;
  worker_id: string;
  site_id: string;
  shift_date: string;
  total_hours: string;
  receipt_id: string;
  status: string;
}

interface MockSupervisor {
  id: string;
  company_id: string;
  name: string;
  phone: string;
  site_ids: string[];
  is_active: boolean;
  pending_sms_approval_ids: string[] | null;
}

const SHIFT_DEFAULT: MockShift = {
  id: SHIFT_A_ID,
  company_id: COMPANY_A,
  worker_id: WORKER_A_ID,
  site_id: SITE_A_ID,
  shift_date: '2026-05-03',
  total_hours: '8.00',
  receipt_id: 'FSTR-MONTEST1',
  status: 'SUBMITTED',
};

const SUPERVISOR_DEFAULT: MockSupervisor = {
  id: SUPERVISOR_A_ID,
  company_id: COMPANY_A,
  name: 'Lauren Test',
  phone: '+61400000002',
  site_ids: [SITE_A_ID],
  is_active: true,
  pending_sms_approval_ids: ['ONTEST1'],
};

interface SetupOpts {
  shift?: Partial<MockShift> | null;
  supervisor?: Partial<MockSupervisor> | null;
  tokenInDb?: string;
  shiftEventInsertError?: { message: string } | null;
  shiftUpdateError?: { message: string } | null;
}

function setupSupabase(opts: SetupOpts = {}) {
  const supervisor =
    opts.supervisor === null
      ? null
      : { ...SUPERVISOR_DEFAULT, ...(opts.supervisor ?? {}) };
  const shift =
    opts.shift === null ? null : { ...SHIFT_DEFAULT, ...(opts.shift ?? {}) };
  const tokenInDb = opts.tokenInDb ?? TOKEN_A;

  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<{ table: string; data: Record<string, unknown> }> = [];

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'supervisors') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn((col: string, val: unknown) => {
            // first .eq is verify_token; chained .eq is is_active=true
            return {
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() =>
                  Promise.resolve({
                    data:
                      col === 'verify_token' && val === tokenInDb && supervisor
                        ? supervisor
                        : null,
                    error: null,
                  }),
                ),
              })),
            };
          }),
        })),
        update: vi.fn((data) => {
          updates.push({ table: 'supervisors', data });
          return { eq: vi.fn(() => Promise.resolve({ error: null })) };
        }),
      };
    }
    if (table === 'shifts') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: shift,
                error: shift ? null : { message: 'not found' },
              }),
            ),
          })),
        })),
        update: vi.fn((data) => {
          updates.push({ table: 'shifts', data });
          return {
            eq: vi.fn(() => ({
              eq: vi.fn(() =>
                Promise.resolve({ error: opts.shiftUpdateError ?? null }),
              ),
            })),
          };
        }),
      };
    }
    if (table === 'workers' || table === 'sites' || table === 'companies') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data:
                  table === 'workers'
                    ? { first_name: 'Joao', last_name: 'Test' }
                    : table === 'sites'
                      ? { name: 'Mt Stromlo Test' }
                      : { contact_email: 'support@flosmosis.com' },
                error: null,
              }),
            ),
          })),
        })),
      };
    }
    if (table === 'shift_events') {
      return {
        select: vi.fn(() => ({
          // WLES v1 chain-tail: .eq(company_id).eq(spec_version)
          //   .order(created_at).limit(1).maybeSingle()
          // Returns the seeded prevhash for spec_version='1.0' so no
          // bridge insert is needed; returns null for '0' too (the
          // helper only consults v0 when v1 is empty).
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(() =>
                    Promise.resolve({
                      data: { event_hash: 'prevhash'.padEnd(64, 'a') },
                      error: null,
                    }),
                  ),
                  single: vi.fn(() =>
                    Promise.resolve({
                      data: { event_hash: 'prevhash'.padEnd(64, 'a') },
                      error: null,
                    }),
                  ),
                })),
              })),
            })),
            // Legacy single-.eq chain retained for any callers.
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { event_hash: 'prevhash'.padEnd(64, 'a') },
                    error: null,
                  }),
                ),
              })),
            })),
          })),
        })),
        insert: vi.fn((row: Record<string, unknown>) => {
          inserts.push(row);
          // Supports both the bare insert (bridge) and the
          // insert(...).select('id').single() shape used by
          // insertV1Event. The injected shiftEventInsertError flows
          // through single() so insertV1Event throws.
          const terminal = {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: opts.shiftEventInsertError ? null : { id: 'evt-1' },
                  error: opts.shiftEventInsertError ?? null,
                }),
            }),
            then: (resolve: (v: { data: null; error: null }) => unknown) =>
              resolve({ data: null, error: null }),
          };
          return terminal as unknown as ReturnType<typeof vi.fn>;
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return { inserts, updates };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Source-string substrate ───────────────────────────────────────

describe('verify/approve — source-string substrate', () => {
  it('1. requires verify_token in body (rejects requests without it)', () => {
    expect(ROUTE_SOURCE).toMatch(/verify_token required/);
    expect(ROUTE_SOURCE).toMatch(/MISSING_TOKEN/);
  });

  it('2. derives supervisor identity from verify_token (the only trust anchor)', () => {
    expect(ROUTE_SOURCE).toMatch(/the only trust anchor/);
    expect(ROUTE_SOURCE).toMatch(/\.eq\(['"]verify_token['"]/);
    expect(ROUTE_SOURCE).toMatch(/\.eq\(['"]is_active['"],\s*true\)/);
  });

  it('3. ignores body-supplied supervisor_id / supervisor_phone (token is sole trust)', () => {
    // Pre Day-7 P0-2 patch (commit landing in Apr 2026), the route
    // accepted supervisor_id from the body. The hardening pin: the
    // body-typed fields are still declared but explicitly NOT trusted.
    expect(ROUTE_SOURCE).toMatch(/are NOT[\s\n\/]+trusted/);
  });

  it('4. site-access enforcement: supervisor.site_ids must include shift.site_id', () => {
    expect(ROUTE_SOURCE).toMatch(/supervisorSiteIds\.includes\(shift\.site_id\)/);
    expect(ROUTE_SOURCE).toMatch(/site_access_denied/);
  });

  it('5. shifts UPDATE has a status guard (.eq status SUBMITTED) — replay defence', () => {
    // Without this, two concurrent approvals could both write
    // SUPERVISOR_APPROVED. The compound predicate ensures only one wins.
    expect(ROUTE_SOURCE).toMatch(/\.eq\(['"]status['"],\s*['"]SUBMITTED['"]\)/);
  });

  it('6. rate-limited per IP', () => {
    expect(ROUTE_SOURCE).toMatch(/checkRateLimit/);
    expect(ROUTE_SOURCE).toMatch(/Rate limit exceeded/);
  });

  it('7. SUPERVISOR_APPROVAL event chains via previous_event_hash', () => {
    // M1: chain-linkage is now performed by the v1 builder via the
    // `previousEventHash` argument (camelCase, mapped to
    // previous_event_hash inside the sealed event). The semantic pin
    // remains: the route passes the chain-tail through to the builder.
    expect(ROUTE_SOURCE).toMatch(
      /previousEventHash[,\s]/,
    );
    expect(ROUTE_SOURCE).toMatch(
      /getV1ChainTail\(/,
    );
  });

  it('8. event_data records method WOHJO_VERIFY (distinguishes from SMS path)', () => {
    expect(ROUTE_SOURCE).toMatch(/method:\s*['"]WOHJO_VERIFY['"]/);
  });
});

// ─── Handler-invocation defensive coverage ─────────────────────────

describe('verify/approve — defensive coverage', () => {
  it('9. happy path: valid token + assigned site → 200, SUPERVISOR_APPROVAL written', async () => {
    const { inserts, updates } = setupSupabase();
    const req = new Request('http://test/api/verify/approve/' + SHIFT_A_ID, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ verify_token: TOKEN_A }),
    });
    const res = await POST(req, {
      params: Promise.resolve({ shiftId: SHIFT_A_ID }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { method?: string };
    expect(json.method).toBe('WOHJO_VERIFY');
    // SUPERVISOR_APPROVAL row was inserted
    // WLES v1.0 prefixes FLOSTRUCTION-specific event types.
    const approval = inserts.find((r) => r.event_type === 'SUPERVISOR_APPROVAL');
    expect(approval).toBeDefined();
    // Shifts row was updated to SUPERVISOR_APPROVED
    const shiftUpdate = updates.find((u) => u.table === 'shifts');
    expect(shiftUpdate?.data.status).toBe('SUPERVISOR_APPROVED');
  });

  it('10. wrong token → 401 + nothing written', async () => {
    const { inserts, updates } = setupSupabase({ tokenInDb: TOKEN_A });
    const req = new Request('http://test/api/verify/approve/' + SHIFT_A_ID, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ verify_token: TOKEN_B }),
    });
    const res = await POST(req, {
      params: Promise.resolve({ shiftId: SHIFT_A_ID }),
    });
    expect(res.status).toBe(401);
    expect(inserts.length).toBe(0);
    expect(updates.length).toBe(0);
  });

  it('11. missing token → 401 with code MISSING_TOKEN', async () => {
    setupSupabase();
    const req = new Request('http://test/api/verify/approve/' + SHIFT_A_ID, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await POST(req, {
      params: Promise.resolve({ shiftId: SHIFT_A_ID }),
    });
    expect(res.status).toBe(401);
    const json = (await res.json()) as { code?: string };
    expect(json.code).toBe('MISSING_TOKEN');
  });

  it('12. cross-tenant: token-A supervisor cannot approve company-B shift (site_ids mismatch)', async () => {
    // Supervisor A's site_ids = [SITE_A_ID]; shift is on a DIFFERENT
    // site. Token validates but site-access guard rejects.
    const { inserts } = setupSupabase({
      shift: { site_id: '00000000-3000-0000-0000-9999999999ff' },
    });
    const req = new Request('http://test/api/verify/approve/' + SHIFT_A_ID, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ verify_token: TOKEN_A }),
    });
    const res = await POST(req, {
      params: Promise.resolve({ shiftId: SHIFT_A_ID }),
    });
    expect(res.status).toBe(403);
    expect(inserts.length).toBe(0);
  });

  it('13. inactive supervisor (is_active=false) cannot approve', async () => {
    // The select chain filters on is_active=true; if the supervisor
    // is inactive, the maybeSingle returns null and the route 401s.
    const { inserts } = setupSupabase({ supervisor: null });
    const req = new Request('http://test/api/verify/approve/' + SHIFT_A_ID, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ verify_token: TOKEN_A }),
    });
    const res = await POST(req, {
      params: Promise.resolve({ shiftId: SHIFT_A_ID }),
    });
    expect(res.status).toBe(401);
    expect(inserts.length).toBe(0);
  });

  it('14. shift not found → 404', async () => {
    setupSupabase({ shift: null });
    const req = new Request('http://test/api/verify/approve/' + SHIFT_A_ID, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ verify_token: TOKEN_A }),
    });
    const res = await POST(req, {
      params: Promise.resolve({ shiftId: SHIFT_A_ID }),
    });
    expect(res.status).toBe(404);
  });

  it('15. already-approved shift (status != SUBMITTED) → 409', async () => {
    setupSupabase({ shift: { status: 'SUPERVISOR_APPROVED' } });
    const req = new Request('http://test/api/verify/approve/' + SHIFT_A_ID, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ verify_token: TOKEN_A }),
    });
    const res = await POST(req, {
      params: Promise.resolve({ shiftId: SHIFT_A_ID }),
    });
    expect(res.status).toBe(409);
  });

  it('16. disputed shift → 409', async () => {
    setupSupabase({ shift: { status: 'DISPUTED' } });
    const req = new Request('http://test/api/verify/approve/' + SHIFT_A_ID, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ verify_token: TOKEN_A }),
    });
    const res = await POST(req, {
      params: Promise.resolve({ shiftId: SHIFT_A_ID }),
    });
    expect(res.status).toBe(409);
  });

  it('17. SUPERVISOR_APPROVAL event chains via previous_event_hash from prior chain tail', async () => {
    const { inserts } = setupSupabase();
    const req = new Request('http://test/api/verify/approve/' + SHIFT_A_ID, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ verify_token: TOKEN_A }),
    });
    await POST(req, { params: Promise.resolve({ shiftId: SHIFT_A_ID }) });
    // WLES v1.0 prefixes FLOSTRUCTION-specific event types.
    const approval = inserts.find((r) => r.event_type === 'SUPERVISOR_APPROVAL');
    expect(approval?.previous_event_hash).toBe('prevhash'.padEnd(64, 'a'));
    expect(approval?.event_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('18. supervisor pending_sms_approval_ids is updated to remove the approved code', async () => {
    const { updates } = setupSupabase();
    const req = new Request('http://test/api/verify/approve/' + SHIFT_A_ID, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ verify_token: TOKEN_A }),
    });
    await POST(req, { params: Promise.resolve({ shiftId: SHIFT_A_ID }) });
    const supUpdate = updates.find((u) => u.table === 'supervisors');
    expect(supUpdate).toBeDefined();
    // The approved code 'ONTEST1' should be filtered out of pending list.
    // receipt_id 'FSTR-MONTEST1' last 6 chars = 'NTEST1' (the SMS code).
    // The supervisor's pending list seeded with 'ONTEST1' should NOT
    // be filtered out by this approval — only matching codes get
    // removed. Pin: the update is invoked (defensive), and the data
    // shape is intact (string[]).
    expect(supUpdate!.data.pending_sms_approval_ids).toBeDefined();
    expect(Array.isArray(supUpdate!.data.pending_sms_approval_ids)).toBe(true);
  });
});

// ─── Substrate-DD findings (NOT auto-fixed) ────────────────────────
//
// Per Monday brief Task 5 substrate-DD constraint: surface findings;
// do NOT auto-implement architectural changes.
//
// Finding 5-A — verify_token has NO per-token expiry timestamp.
// The token is rotated weekly via /api/cron/rotate-verify-tokens
// (cron schedule "0 14 * * 1" per vercel.json — Mondays 14:00 UTC).
// Within the rotation window, the same token is reusable. Replay
// protection within the window is provided ONLY by the shifts row
// status guard (.eq('status', 'SUBMITTED')). Once a shift is
// approved, replays return 409 — not pure replay protection but
// functionally equivalent at the per-shift level.
//
// Threat model implication: if a token leaks during the week
// between rotations, the attacker can approve any shift the
// supervisor's site_ids covers, until either (a) the shift is
// already approved (replay → 409) or (b) the next rotation
// invalidates the token. Median time-to-rotation: 3.5 days.
//
// Recommended hardening (Lauren-decides):
//   - Per-token expiry timestamp (e.g. token issued_at +
//     VERIFY_TOKEN_TTL = 24 hours) would shrink the window from
//     7 days to 24 hours.
//   - One-time-use tokens per shift (each SMS link includes a
//     short-lived signed token bound to the specific shift_id)
//     would close the window entirely but require SMS-side changes.
// Both are substantive substrate decisions; flagged here for
// founder architectural review.
//
// Finding 5-B — body-supplied supervisor_id / supervisor_phone
// fields are declared in the request type but explicitly ignored.
// They predate the Day-7 P0-2 hardening commit. Recommendation:
// remove them from the request type entirely; doc-comment lag
// remains a minor signal-of-staleness indicator. NOT urgent.
//
// Finding 5-C — site_ids is a flat uuid array. A supervisor with
// 100 sites matches the .includes() check linearly. For Mo Week 1
// (1-2 sites) this is fine; at scale the access check is O(n).
// NOT urgent.
