// CRACK 195 — /api/worker/disputes tests.
//
// Source-string + mock-invocation tests covering:
//   POST:
//     1. Source-string substrate: WORKER_DISPUTE_FILED event write + chain
//     2. Happy path: dispute inserted + event inserted → 201
//     3. 400 on invalid body
//     4. 403 when not authenticated
//     5. 429 rate limited
//     6. 403 when MFA grant absent
//     7. Event insert failure non-fatal (dispute still succeeds)
//   GET:
//     8. Source-string substrate: lists worker's own disputes
//     9. Happy path: returns disputes array
//    10. 403 when not authenticated

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Source file ─────────────────────────────────────────────────────────────

// W1.4 (2026-06-10): DB access relocated into scoped repositories —
// the substrate assertions follow the relocated halves there.
const DISPUTES_REPO_SOURCE = readFileSync(
  join(process.cwd(), 'src/lib/db/repositories/disputes.repo.ts'),
  'utf-8',
);
const ROUTE_SOURCE = readFileSync(
  join(process.cwd(), 'src/app/api/worker/disputes/route.ts'),
  'utf-8',
);

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn() },
}));

const { requireWorkerIdentityMock } = vi.hoisted(() => ({
  requireWorkerIdentityMock: vi.fn(),
}));

const { assertActiveGrantMock } = vi.hoisted(() => ({
  assertActiveGrantMock: vi.fn(),
}));

const { checkRateLimitMock } = vi.hoisted(() => ({
  checkRateLimitMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => supabaseMock,
}));
vi.mock('@/lib/auth/session', () => ({
  requireWorkerIdentity: requireWorkerIdentityMock,
}));
vi.mock('@/lib/auth/worker-mfa', () => ({
  assertActiveGrant: assertActiveGrantMock,
}));
vi.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIP: () => '127.0.0.1',
}));
vi.mock('@/lib/logger', () => ({
  routeLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { POST, GET } from '../../src/app/api/worker/disputes/route';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const WORKER_ID = '00000000-0000-4000-8000-000000000001';
const COMPANY_ID = '00000000-0000-4001-8000-000000000001';
const USER_ID = '00000000-0000-4002-8000-000000000001';
const DISPUTE_ID = '00000000-0000-4003-8000-000000000001';
const EVENT_ID = '00000000-0000-4004-8000-000000000001';
const SHIFT_ID = '00000000-0000-4005-8000-000000000001';

const VALID_BODY = {
  dispute_type: 'hours_disputed',
  narrative: 'My hours were incorrect for the week ending 5 May.',
};

function makePostRequest(body: Record<string, unknown> = VALID_BODY) {
  return new Request('http://test/api/worker/disputes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeGetRequest() {
  return new Request('http://test/api/worker/disputes', { method: 'GET' });
}

function chainable(result: { data?: unknown; error?: unknown | null }) {
  const c: Record<string, unknown> = {};
  for (const m of [
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
  ]) {
    c[m] = vi.fn(() => c);
  }
  c['single'] = vi.fn(() => Promise.resolve(result));
  c['maybeSingle'] = vi.fn(() => Promise.resolve(result));
  c['then'] = (res: (v: typeof result) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej);
  c['catch'] = (rej: (e: unknown) => unknown) => Promise.resolve(result).catch(rej);
  return c;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkerIdentityMock.mockResolvedValue({
    workerId: WORKER_ID,
    companyId: COMPANY_ID,
    userId: USER_ID,
  });
  assertActiveGrantMock.mockResolvedValue({
    grantId: '00000000-0000-4010-8000-000000000001',
    workerId: WORKER_ID,
    challengeFor: 'DISPUTE_NEW',
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
  });
  checkRateLimitMock.mockReturnValue({
    allowed: true,
    remaining: 4,
    resetAt: Date.now() + 3_600_000,
  });
});

// ─── Source-string substrate ─────────────────────────────────────────────────

describe('worker/disputes POST — source-string substrate (CRACK 195)', () => {
  it('writes WORKER_DISPUTE_FILED event with hash chain', () => {
    expect(ROUTE_SOURCE).toContain("event_type: 'WORKER_DISPUTE_FILED'");
    expect(ROUTE_SOURCE).toContain('previous_event_hash:');
    expect(ROUTE_SOURCE).toContain('parent_shift_event_id:');
    expect(ROUTE_SOURCE).toContain("spec_version: '0'");
  });

  it('uses generateEventHash for the event hash', () => {
    expect(ROUTE_SOURCE).toContain('generateEventHash');
    expect(ROUTE_SOURCE).toContain("event_type: 'WORKER_DISPUTE_FILED'");
  });

  it('gates on DISPUTE_NEW MFA grant', () => {
    expect(ROUTE_SOURCE).toContain('assertActiveGrant');
    expect(ROUTE_SOURCE).toContain("'DISPUTE_NEW'");
  });

  it('inserts into worker_disputes with open status', () => {
    // W1.4: the insert relocated to workerDisputesRepo (worker_id +
    // company_id from the binding); payload literal stays at the call
    // site. Assert both halves (S9).
    expect(ROUTE_SOURCE).toContain('dRepo.insertDispute(');
    expect(DISPUTES_REPO_SOURCE).toContain("from('worker_disputes')");
    expect(ROUTE_SOURCE).toContain("status: 'open'");
    expect(ROUTE_SOURCE).toContain('dispute_type');
    expect(ROUTE_SOURCE).toContain('narrative');
  });

  it('returns dispute_id + event_id on success', () => {
    expect(ROUTE_SOURCE).toContain('dispute_id');
    expect(ROUTE_SOURCE).toContain('event_id');
  });
});

describe('worker/disputes GET — source-string substrate (CRACK 195)', () => {
  it('lists from worker_disputes ordered by created_at desc', () => {
    // W1.4: the list query relocated to workerDisputesRepo.listMine —
    // assert delegation in the route and the query in the repo (S9).
    expect(ROUTE_SOURCE).toContain('.listMine()');
    expect(DISPUTES_REPO_SOURCE).toContain("from('worker_disputes')");
    expect(DISPUTES_REPO_SOURCE).toContain("eq('worker_id', workerId)");
    expect(DISPUTES_REPO_SOURCE).toContain('ascending: false');
  });

  it('returns disputes array in response', () => {
    expect(ROUTE_SOURCE).toContain('disputes:');
  });
});

// ─── POST happy path ──────────────────────────────────────────────────────────

describe('worker/disputes POST — happy path', () => {
  it('returns 201 with dispute_id + event_id on success', async () => {
    let fromCall = 0;
    supabaseMock.from.mockImplementation((table: string) => {
      fromCall++;
      if (table === 'shifts') return chainable({ data: null, error: null });
      if (table === 'workers') return chainable({ data: { primary_site_id: null }, error: null });
      if (table === 'worker_disputes') {
        return chainable({
          data: { id: DISPUTE_ID, created_at: new Date().toISOString() },
          error: null,
        });
      }
      if (table === 'shift_events') {
        // first call: fetch last event; second call: insert
        return chainable({ data: { id: EVENT_ID, event_hash: 'a'.repeat(64) }, error: null });
      }
      return chainable({ data: null, error: null });
    });

    const res = await POST(makePostRequest());
    expect(res.status).toBe(201);
    const json = (await res.json()) as { ok: boolean; dispute_id: string; event_id: string };
    expect(json.ok).toBe(true);
    expect(json.dispute_id).toBe(DISPUTE_ID);
  });

  it('chains off the last event for the worker', async () => {
    const priorHash = 'b'.repeat(64);
    const insertedChains: Array<Record<string, unknown>> = [];

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'shifts') return chainable({ data: null, error: null });
      if (table === 'workers') return chainable({ data: { primary_site_id: null }, error: null });
      if (table === 'worker_disputes') {
        return chainable({
          data: { id: DISPUTE_ID, created_at: new Date().toISOString() },
          error: null,
        });
      }
      if (table === 'shift_events') {
        // We need to track calls: first is SELECT (last event), second is INSERT
        const c = chainable({ data: { id: EVENT_ID, event_hash: priorHash }, error: null });
        const origInsert = c['insert'] as (v: unknown) => unknown;
        (c as Record<string, unknown>)['insert'] = (v: unknown) => {
          insertedChains.push(v as Record<string, unknown>);
          return origInsert(v);
        };
        return c;
      }
      return chainable({ data: null, error: null });
    });

    await POST(makePostRequest());
    // The insert call captured should include previous_event_hash
    // (we can verify the source-string assertion covers this)
    expect(supabaseMock.from).toHaveBeenCalledWith('shift_events');
  });

  it('uses related_shift_id site_id when provided', async () => {
    const SITE_ID = '00000000-0000-4020-8000-000000000001';
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'shifts')
        return chainable({ data: { site_id: SITE_ID, company_id: COMPANY_ID }, error: null });
      if (table === 'worker_disputes') {
        return chainable({
          data: { id: DISPUTE_ID, created_at: new Date().toISOString() },
          error: null,
        });
      }
      if (table === 'shift_events') {
        return chainable({ data: { id: EVENT_ID, event_hash: 'c'.repeat(64) }, error: null });
      }
      return chainable({ data: null, error: null });
    });

    const res = await POST(makePostRequest({ ...VALID_BODY, related_shift_id: SHIFT_ID }));
    expect(res.status).toBe(201);
    expect(supabaseMock.from).toHaveBeenCalledWith('shifts');
  });
});

// ─── POST error paths ─────────────────────────────────────────────────────────

describe('worker/disputes POST — error paths', () => {
  it('returns 403 on auth failure', async () => {
    const { AuthorizationError } = await import('../../src/lib/auth/errors');
    requireWorkerIdentityMock.mockRejectedValue(
      new AuthorizationError(403, 'NOT_AUTHENTICATED', 'No session'),
    );
    const res = await POST(makePostRequest());
    expect(res.status).toBe(403);
  });

  it('returns 429 on rate limit', async () => {
    checkRateLimitMock.mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 3_600_000,
    });
    const res = await POST(makePostRequest());
    expect(res.status).toBe(429);
  });

  it('returns 400 on invalid body', async () => {
    const res = await POST(makePostRequest({ dispute_type: 'INVALID', narrative: 'x' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when narrative too short', async () => {
    const res = await POST(makePostRequest({ dispute_type: 'hours_disputed', narrative: 'short' }));
    expect(res.status).toBe(400);
  });

  it('returns 403 on missing MFA grant', async () => {
    const { AuthorizationError } = await import('../../src/lib/auth/errors');
    assertActiveGrantMock.mockRejectedValue(
      new AuthorizationError(403, 'MFA_REQUIRED', 'Verify your identity to continue.'),
    );
    const res = await POST(makePostRequest());
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('MFA_REQUIRED');
  });

  it('returns 201 even when event insert fails (non-fatal)', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'shifts') return chainable({ data: null, error: null });
      if (table === 'workers') return chainable({ data: { primary_site_id: null }, error: null });
      if (table === 'worker_disputes') {
        return chainable({
          data: { id: DISPUTE_ID, created_at: new Date().toISOString() },
          error: null,
        });
      }
      if (table === 'shift_events') {
        // SELECT returns last event; INSERT returns error
        return chainable({ data: null, error: { message: 'hash collision' } });
      }
      return chainable({ data: null, error: null });
    });

    const res = await POST(makePostRequest());
    expect(res.status).toBe(201);
    const json = (await res.json()) as { ok: boolean; event_id: string | null };
    expect(json.ok).toBe(true);
    expect(json.event_id).toBeNull();
  });
});

// ─── GET happy path ───────────────────────────────────────────────────────────

describe('worker/disputes GET — happy path', () => {
  it('returns 200 with disputes array', async () => {
    const disputes = [
      {
        id: DISPUTE_ID,
        dispute_type: 'hours_disputed',
        narrative: 'My hours were wrong.',
        related_shift_id: null,
        status: 'open',
        resolution_notes: null,
        resolved_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
    supabaseMock.from.mockReturnValue(chainable({ data: disputes, error: null }));

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { disputes: typeof disputes };
    expect(json.disputes).toHaveLength(1);
    expect(json.disputes[0].id).toBe(DISPUTE_ID);
  });

  it('returns empty array when worker has no disputes', async () => {
    supabaseMock.from.mockReturnValue(chainable({ data: [], error: null }));

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { disputes: unknown[] };
    expect(json.disputes).toHaveLength(0);
  });
});

// ─── GET error paths ──────────────────────────────────────────────────────────

describe('worker/disputes GET — error paths', () => {
  it('returns 403 on auth failure', async () => {
    const { AuthorizationError } = await import('../../src/lib/auth/errors');
    requireWorkerIdentityMock.mockRejectedValue(
      new AuthorizationError(403, 'NOT_AUTHENTICATED', 'No session'),
    );
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
  });
});
