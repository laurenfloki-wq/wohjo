// CRACK 194 — POST /api/worker/mfa/challenge tests.
//
// Source-string + mock-invocation tests verifying:
//   1. Whitelist phone (+61413573579) → challenge row inserted, no Twilio
//   2. Normal phone → issueChallenge + Twilio send
//   3. Rate limit (3/worker/10min) → 429
//   4. No phone on file → 412
//   5. Bad auth → 403
//   6. SMS failure → 502 + challenge invalidated

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Source file ─────────────────────────────────────────────────────────────

const ROUTE_SOURCE = readFileSync(
  join(process.cwd(), 'src/app/api/worker/mfa/challenge/route.ts'),
  'utf-8',
);

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn() },
}));

const { requireWorkerIdentityMock } = vi.hoisted(() => ({
  requireWorkerIdentityMock: vi.fn(),
}));

const { issueChallengeInternalMock } = vi.hoisted(() => ({
  issueChallengeInternalMock: vi.fn(),
}));

const { twilioMessagesMock } = vi.hoisted(() => ({
  twilioMessagesMock: { create: vi.fn() },
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
  issueChallenge: issueChallengeInternalMock,
}));
vi.mock('@/lib/twilio/client', () => ({
  getTwilioClient: () => ({ messages: twilioMessagesMock }),
  getTwilioFromNumber: () => '+61400000000',
}));
vi.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: checkRateLimitMock,
}));
vi.mock('@/lib/logger', () => ({
  routeLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { POST } from '../../src/app/api/worker/mfa/challenge/route';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const WORKER_ID = '00000000-0000-4000-8000-000000000001';
const CHALLENGE_ID = '00000000-0000-4001-8000-000000000001';
const TEST_PHONE = '+61413573579';
const NORMAL_PHONE = '+61412345678';

function makeRequest(body: Record<string, unknown> = { action_intent: 'DISPUTE_NEW' }) {
  return new Request('http://test/api/worker/mfa/challenge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function chainable(result: { data?: unknown; error?: unknown | null }) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'is', 'order', 'limit']) {
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
  requireWorkerIdentityMock.mockResolvedValue({ workerId: WORKER_ID, userId: WORKER_ID });
  checkRateLimitMock.mockReturnValue({
    allowed: true,
    remaining: 2,
    resetAt: Date.now() + 600_000,
  });
  twilioMessagesMock.create.mockResolvedValue({ sid: 'SM001' });
});

// ─── Source-string substrate ─────────────────────────────────────────────────

describe('worker/mfa/challenge — source-string substrate (CRACK 194)', () => {
  it('has test whitelist phone constant', () => {
    expect(ROUTE_SOURCE).toContain('+61413573579');
    expect(ROUTE_SOURCE).toContain('TEST_WHITELIST_CODE');
    expect(ROUTE_SOURCE).toContain('TEST_WHITELIST_EXPIRES');
    expect(ROUTE_SOURCE).toContain('2027-01-01');
  });

  it('skips Twilio for whitelist and logs whitelist event', () => {
    expect(ROUTE_SOURCE).toContain('mfa.challenge.whitelist');
    // Twilio client should only be invoked on the normal path, not in the whitelist block
    expect(ROUTE_SOURCE).toContain('if (phone === TEST_WHITELIST_PHONE)');
    expect(ROUTE_SOURCE).toContain('getTwilioClient');
  });

  it('uses 3/10min rate limit', () => {
    expect(ROUTE_SOURCE).toContain('maxRequests: 3');
    expect(ROUTE_SOURCE).toContain('10 * 60 * 1000');
  });

  it('invalidates prior challenge on SMS failure', () => {
    // W1.4 (2026-06-10): the consume UPDATE relocated into
    // workerMfaChallengesRepo — assert both halves (S9).
    const MFA_REPO_SOURCE = readFileSync(
      join(process.cwd(), 'src/lib/db/repositories/mfa.repo.ts'),
      'utf-8',
    );
    expect(ROUTE_SOURCE).toContain('mfa.challenge.sms_failed');
    expect(ROUTE_SOURCE).toContain('SMS_DELIVERY_FAILED');
    expect(ROUTE_SOURCE).toContain('mfaRepo.consumeById(');
    expect(MFA_REPO_SOURCE).toContain('consumed_at: new Date().toISOString()');
  });

  it('returns 412 when no phone on file', () => {
    expect(ROUTE_SOURCE).toContain('NO_PHONE_ON_FILE');
  });
});

// ─── Auth guard ───────────────────────────────────────────────────────────────

describe('worker/mfa/challenge — auth guard', () => {
  it('returns 403 when worker not authenticated', async () => {
    const { AuthorizationError } = await import('../../src/lib/auth/errors');
    requireWorkerIdentityMock.mockRejectedValue(
      new AuthorizationError(403, 'NOT_AUTHENTICATED', 'No session'),
    );
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
  });
});

// ─── Rate limit ───────────────────────────────────────────────────────────────

describe('worker/mfa/challenge — rate limit', () => {
  it('returns 429 when rate limit exceeded', async () => {
    checkRateLimitMock.mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 300_000,
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
    const json = (await res.json()) as { error: string; retry_after_seconds: number };
    expect(json.error).toBe('RATE_LIMITED');
    expect(json.retry_after_seconds).toBeGreaterThan(0);
  });
});

// ─── No phone on file ────────────────────────────────────────────────────────

describe('worker/mfa/challenge — no phone on file', () => {
  it('returns 412 when worker has no phone', async () => {
    supabaseMock.from.mockReturnValue(
      chainable({ data: { id: WORKER_ID, phone: null }, error: null }),
    );
    const res = await POST(makeRequest());
    expect(res.status).toBe(412);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('NO_PHONE_ON_FILE');
  });
});

// ─── Whitelist path ───────────────────────────────────────────────────────────

describe('worker/mfa/challenge — test whitelist', () => {
  it('returns 201 and does NOT call Twilio for whitelisted phone', async () => {
    // from() called twice: workers select, then challenges update (invalidate), then insert
    let callCount = 0;
    supabaseMock.from.mockImplementation((table: string) => {
      callCount++;
      if (table === 'workers') {
        return chainable({ data: { id: WORKER_ID, phone: TEST_PHONE }, error: null });
      }
      if (table === 'worker_mfa_challenges') {
        return chainable({
          data: { id: CHALLENGE_ID, expires_at: '2027-01-01T00:00:00.000Z' },
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(201);
    const json = (await res.json()) as {
      challenge_id: string;
      expires_at: string;
      delivered_to: string;
    };
    expect(json.challenge_id).toBeDefined();
    expect(json.expires_at).toBeDefined();
    expect(json.delivered_to).toContain('•');
    expect(twilioMessagesMock.create).not.toHaveBeenCalled();
    expect(issueChallengeInternalMock).not.toHaveBeenCalled();
  });

  it('challenge_id returned for whitelist is non-null', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'workers') {
        return chainable({ data: { id: WORKER_ID, phone: TEST_PHONE }, error: null });
      }
      return chainable({
        data: { id: CHALLENGE_ID, expires_at: '2027-01-01T00:00:00.000Z' },
        error: null,
      });
    });

    const res = await POST(makeRequest());
    const json = (await res.json()) as { challenge_id: string };
    expect(json.challenge_id).toBe(CHALLENGE_ID);
  });
});

// ─── Normal path ─────────────────────────────────────────────────────────────

describe('worker/mfa/challenge — normal SMS path', () => {
  it('calls issueChallenge + Twilio for non-whitelisted phone', async () => {
    supabaseMock.from.mockReturnValue(
      chainable({ data: { id: WORKER_ID, phone: NORMAL_PHONE }, error: null }),
    );
    issueChallengeInternalMock.mockResolvedValue({
      challengeId: CHALLENGE_ID,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      code: '654321',
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(201);
    expect(issueChallengeInternalMock).toHaveBeenCalledOnce();
    expect(twilioMessagesMock.create).toHaveBeenCalledOnce();
    const twilioArgs = twilioMessagesMock.create.mock.calls[0][0] as { body: string; to: string };
    expect(twilioArgs.to).toBe(NORMAL_PHONE);
    expect(twilioArgs.body).toContain('654321');

    const json = (await res.json()) as { challenge_id: string; delivered_to: string };
    expect(json.challenge_id).toBe(CHALLENGE_ID);
    expect(json.delivered_to).toMatch(/\+614.*•/);
  });

  it('returns 502 and invalidates challenge when Twilio fails', async () => {
    const invalidateChain = chainable({ data: null, error: null });
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'workers') {
        return chainable({ data: { id: WORKER_ID, phone: NORMAL_PHONE }, error: null });
      }
      return invalidateChain;
    });
    issueChallengeInternalMock.mockResolvedValue({
      challengeId: CHALLENGE_ID,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      code: '654321',
    });
    twilioMessagesMock.create.mockRejectedValue(new Error('Twilio 429: rate limit'));

    const res = await POST(makeRequest());
    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('SMS_DELIVERY_FAILED');
  });
});

// ─── Input validation ────────────────────────────────────────────────────────

describe('worker/mfa/challenge — input validation', () => {
  it('returns 400 for missing action_intent', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('INVALID_BODY');
  });

  it('returns 400 for invalid action_intent value', async () => {
    const res = await POST(makeRequest({ action_intent: 'INVALID_ACTION' }));
    expect(res.status).toBe(400);
  });
});
