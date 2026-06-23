// CRACK 194 — POST /api/worker/mfa/verify tests.
//
// Source-string + mock-invocation tests for /api/worker/mfa/verify.
// The verify route already exists; these tests cover:
//   1. Happy path: correct code → { grant_id, challenge_for, expires_at }
//   2. Wrong code → 401
//   3. Expired challenge → 410
//   4. Consumed challenge → 410
//   5. Too many attempts → 429
//   6. Bad auth → 403
//   7. Invalid body → 400

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Source file ─────────────────────────────────────────────────────────────

const ROUTE_SOURCE = readFileSync(
  join(process.cwd(), 'src/app/api/worker/mfa/verify/route.ts'),
  'utf-8',
);

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const { requireWorkerIdentityMock } = vi.hoisted(() => ({
  requireWorkerIdentityMock: vi.fn(),
}));

const { verifyChallengeMock, rateLimitMock } = vi.hoisted(() => ({
  verifyChallengeMock: vi.fn(),
  rateLimitMock: vi.fn(() => Promise.resolve({ allowed: true, resetAt: Date.now() + 3_600_000 })),
}));

vi.mock('@/lib/auth/session', () => ({
  requireWorkerIdentity: requireWorkerIdentityMock,
}));
vi.mock('@/lib/auth/worker-mfa', () => ({
  verifyChallenge: verifyChallengeMock,
  // AUTH-5 — the route also imports the device-binding helper; keep it real
  // (pure sha256, no Supabase) so the route computes a binding as in prod.
  deviceBindingFromUserAgent: (ua: string | null | undefined) =>
    `binding:${ua ?? ''}`,
}));
// AUTH-4 — the verify route now durably rate-limits by worker + IP.
vi.mock('@/lib/security/rate-limit-durable', () => ({
  checkRateLimitDurable: rateLimitMock,
}));
vi.mock('@/lib/security/rate-limit', () => ({
  getClientIP: () => '203.0.113.7',
}));
vi.mock('@/lib/logger', () => ({
  routeLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { POST } from '../../src/app/api/worker/mfa/verify/route';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const WORKER_ID = '00000000-0000-4000-8000-000000000001';
const CHALLENGE_ID = '00000000-0000-4001-8000-000000000001';
const GRANT_ID = '00000000-0000-4002-8000-000000000001';

function makeRequest(
  body: Record<string, unknown> = {
    challenge_id: CHALLENGE_ID,
    code: '654321',
  },
) {
  return new Request('http://test/api/worker/mfa/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkerIdentityMock.mockResolvedValue({ workerId: WORKER_ID, userId: WORKER_ID });
  rateLimitMock.mockResolvedValue({ allowed: true, resetAt: Date.now() + 3_600_000 });
});

// ─── Source-string substrate ─────────────────────────────────────────────────

describe('worker/mfa/verify — source-string substrate (CRACK 194)', () => {
  it('delegates to verifyChallenge helper', () => {
    expect(ROUTE_SOURCE).toContain('verifyChallenge');
    expect(ROUTE_SOURCE).toContain('identity.workerId');
    expect(ROUTE_SOURCE).toContain('challenge_id');
  });

  it('returns grant_id + challenge_for + expires_at on success', () => {
    expect(ROUTE_SOURCE).toContain('grant_id');
    expect(ROUTE_SOURCE).toContain('challenge_for');
    expect(ROUTE_SOURCE).toContain('expires_at');
  });

  it('validates code as 6-digit string', () => {
    expect(ROUTE_SOURCE).toContain('6 digits');
    expect(ROUTE_SOURCE).toContain('\\d{6}');
  });

  it('surfaces AuthorizationError status codes', () => {
    expect(ROUTE_SOURCE).toContain('AuthorizationError');
    expect(ROUTE_SOURCE).toContain('err.status');
    expect(ROUTE_SOURCE).toContain('err.code');
  });
});

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('worker/mfa/verify — happy path', () => {
  it('returns 200 with grant on correct code', async () => {
    const expiresAt = new Date(Date.now() + 900_000).toISOString();
    verifyChallengeMock.mockResolvedValue({
      grantId: GRANT_ID,
      workerId: WORKER_ID,
      challengeFor: 'DISPUTE_NEW',
      expiresAt,
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      grant_id: string;
      challenge_for: string;
      expires_at: string;
    };
    expect(json.grant_id).toBe(GRANT_ID);
    expect(json.challenge_for).toBe('DISPUTE_NEW');
    expect(json.expires_at).toBe(expiresAt);
  });
});

// ─── Error paths ─────────────────────────────────────────────────────────────

describe('worker/mfa/verify — error paths', () => {
  it('returns 401 on wrong code', async () => {
    const { AuthorizationError } = await import('../../src/lib/auth/errors');
    verifyChallengeMock.mockRejectedValue(
      new AuthorizationError(401, 'MFA_WRONG_CODE', 'That code does not match.'),
    );
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('MFA_WRONG_CODE');
  });

  it('returns 410 on expired challenge', async () => {
    const { AuthorizationError } = await import('../../src/lib/auth/errors');
    verifyChallengeMock.mockRejectedValue(
      new AuthorizationError(410, 'MFA_EXPIRED', 'MFA challenge expired. Request a new code.'),
    );
    const res = await POST(makeRequest());
    expect(res.status).toBe(410);
  });

  it('returns 410 on consumed challenge', async () => {
    const { AuthorizationError } = await import('../../src/lib/auth/errors');
    verifyChallengeMock.mockRejectedValue(
      new AuthorizationError(410, 'MFA_CONSUMED', 'MFA challenge already used.'),
    );
    const res = await POST(makeRequest());
    expect(res.status).toBe(410);
  });

  it('returns 429 when too many attempts', async () => {
    const { AuthorizationError } = await import('../../src/lib/auth/errors');
    verifyChallengeMock.mockRejectedValue(
      new AuthorizationError(429, 'MFA_LOCKED', 'Too many wrong codes. Request a new one.'),
    );
    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
  });

  it('returns 429 when the durable verify throttle denies (AUTH-4)', async () => {
    rateLimitMock.mockResolvedValueOnce({ allowed: false, resetAt: Date.now() + 60_000 });
    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
    const json = (await res.json()) as { error: string; retry_after_seconds: number };
    expect(json.error).toBe('RATE_LIMITED');
    expect(json.retry_after_seconds).toBeGreaterThan(0);
    // The throttle short-circuits before the challenge is ever touched.
    expect(verifyChallengeMock).not.toHaveBeenCalled();
  });

  it('returns 403 on auth failure', async () => {
    const { AuthorizationError } = await import('../../src/lib/auth/errors');
    requireWorkerIdentityMock.mockRejectedValue(
      new AuthorizationError(403, 'NOT_AUTHENTICATED', 'No session'),
    );
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
  });
});

// ─── Input validation ────────────────────────────────────────────────────────

describe('worker/mfa/verify — input validation', () => {
  it('returns 400 for missing challenge_id', async () => {
    const res = await POST(makeRequest({ code: '123456' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-uuid challenge_id', async () => {
    const res = await POST(makeRequest({ challenge_id: 'not-a-uuid', code: '123456' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-6-digit code', async () => {
    const res = await POST(makeRequest({ challenge_id: CHALLENGE_ID, code: '12345' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-numeric code', async () => {
    const res = await POST(makeRequest({ challenge_id: CHALLENGE_ID, code: 'abcdef' }));
    expect(res.status).toBe(400);
  });
});
