// CRACK 225 / WS6 — /api/admin/stripe-mode tests.
//
// Source-string + handler-invocation hybrid. Verifies:
//   * sk_test_* prefix → mode='test', key_prefix='sk_test'
//   * sk_live_* prefix → mode='live', key_prefix='sk_live'
//   * missing key → mode='unconfigured'
//   * unauthenticated caller is rejected with 401/403
//   * no full secret leaks into the response body (regex over JSON)
//
// We mock getCompanyIdForSession so we don't need a real Supabase
// session in the test environment.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));

vi.mock('@/lib/auth/session', () => ({
  getCompanyIdForSession: authMock,
}));
vi.mock('@/lib/auth/response', () => ({
  authErrorResponse: vi.fn().mockImplementation((err: { status?: number; message?: string }) => {
    return new Response(JSON.stringify({ error: err.message ?? 'auth' }), {
      status: err.status ?? 401,
      headers: { 'content-type': 'application/json' },
    });
  }),
}));
vi.mock('@/lib/logger', () => ({
  routeLogger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
}));

import { AuthorizationError } from '@/lib/auth/errors';
import { GET } from './route';

function buildRequest(): Request {
  return new Request('http://test/api/admin/stripe-mode', { method: 'GET' });
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  authMock.mockReset();
  authMock.mockResolvedValue({
    userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    companyId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    role: 'admin',
  });
});

afterEach(() => {
  // Restore env so cross-test bleeding doesn't happen.
  process.env = { ...ORIGINAL_ENV };
});

describe('GET /api/admin/stripe-mode — mode detection', () => {
  it('returns mode=test when STRIPE_SECRET_KEY starts with sk_test_', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_' + 'a'.repeat(64);
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_' + 'b'.repeat(40);
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_' + 'c'.repeat(40);
    const res = await GET(buildRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.mode).toBe('test');
    expect(body.key_prefix).toBe('sk_test');
    expect(body.webhook_secret_configured).toBe(true);
    expect(body.webhook_secret_prefix).toBe('whsec_test');
    expect(body.publishable_key_prefix).toBe('pk_test');
  });

  it('returns mode=live when STRIPE_SECRET_KEY starts with sk_live_', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_' + 'x'.repeat(64);
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_' + 'y'.repeat(40);
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_live_' + 'z'.repeat(40);
    const res = await GET(buildRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.mode).toBe('live');
    expect(body.key_prefix).toBe('sk_live');
    expect(body.webhook_secret_prefix).toBe('whsec');
    expect(body.publishable_key_prefix).toBe('pk_live');
  });

  it('returns mode=unconfigured when STRIPE_SECRET_KEY is missing', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    const res = await GET(buildRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.mode).toBe('unconfigured');
    expect(body.key_prefix).toBeNull();
    expect(body.webhook_secret_configured).toBe(false);
  });

  it('does NOT leak full secret values in the response body', async () => {
    const secret = 'sk_test_SUPERSECRETSHOULDNOTLEAK1234567890';
    const webhook = 'whsec_test_VERYSECRETWHTOO1234567890';
    process.env.STRIPE_SECRET_KEY = secret;
    process.env.STRIPE_WEBHOOK_SECRET = webhook;
    const res = await GET(buildRequest());
    const text = await res.text();
    expect(text).not.toContain('SUPERSECRETSHOULDNOTLEAK');
    expect(text).not.toContain('VERYSECRETWHTOO');
  });
});

describe('GET /api/admin/stripe-mode — auth', () => {
  it('returns 401 when no session present', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_' + 'a'.repeat(64);
    authMock.mockRejectedValueOnce(
      new AuthorizationError(401, 'UNAUTHENTICATED', 'Authentication required.'),
    );
    const res = await GET(buildRequest());
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is not a company admin', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_' + 'a'.repeat(64);
    authMock.mockRejectedValueOnce(
      new AuthorizationError(403, 'NOT_A_COMPANY_ADMIN', 'User is not a registered admin.'),
    );
    const res = await GET(buildRequest());
    expect(res.status).toBe(403);
  });
});
