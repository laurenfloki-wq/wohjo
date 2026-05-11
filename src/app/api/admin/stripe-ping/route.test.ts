// CRACK 235 / WS4 — /api/admin/stripe-ping tests.
//
// Mocks global fetch to simulate the Stripe /v1/account response.
// Coverage:
//   - happy path test mode (sk_test_*) → ok:true, livemode:false
//   - happy path live mode (sk_live_*) → ok:true, livemode:true
//   - missing STRIPE_SECRET_KEY → 500 NO_KEY
//   - Stripe 401 (invalid key) → 500 STRIPE_ERR with detail
//   - network error → 502 NETWORK
//   - unauthenticated → 401
//   - non-admin → 403
//   - secret value never appears in the response body

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
const fetchMock = vi.fn();

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

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {
  authMock.mockReset();
  authMock.mockResolvedValue({
    userId: 'admin-uuid',
    companyId: 'company-uuid',
    role: 'admin',
  });
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  global.fetch = ORIGINAL_FETCH;
});

function buildRequest(): Request {
  return new Request('http://test/api/admin/stripe-ping', { method: 'GET' });
}

describe('GET /api/admin/stripe-ping — happy path', () => {
  it('test-mode key → ok:true, livemode:false, prefix sk_test', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_' + 'a'.repeat(64);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'acct_test123',
          business_profile: { name: 'FLOSMOSIS Test' },
          country: 'AU',
          details_submitted: true,
          charges_enabled: false,
          payouts_enabled: false,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const res = await GET(buildRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.livemode).toBe(false);
    expect(body.account_id).toBe('acct_test123');
    expect(body.display_name).toBe('FLOSMOSIS Test');
    expect(body.country).toBe('AU');
    expect(body.prefix).toBe('sk_test');

    // Verify the Authorization header was Basic <secret>:
    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe('https://api.stripe.com/v1/account');
    expect((call[1].headers as Record<string, string>).Authorization).toMatch(/^Basic /);
  });

  it('live-mode key → ok:true, livemode:true, prefix sk_live', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_' + 'b'.repeat(64);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'acct_live456',
          business_profile: { name: 'FLOSMOSIS Pty Ltd' },
          country: 'AU',
          details_submitted: true,
          charges_enabled: true,
          payouts_enabled: true,
        }),
        { status: 200 },
      ),
    );
    const res = await GET(buildRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.livemode).toBe(true);
    expect(body.prefix).toBe('sk_live');
    expect(body.charges_enabled).toBe(true);
    expect(body.payouts_enabled).toBe(true);
  });

  it('no secret leaks into the response body', async () => {
    const secret = 'sk_test_SHOULDNOTAPPEARANYWHEREINOUTPUT';
    process.env.STRIPE_SECRET_KEY = secret;
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 'acct_x', country: 'AU' }), { status: 200 }),
    );
    const res = await GET(buildRequest());
    const text = await res.text();
    expect(text).not.toContain('SHOULDNOTAPPEARANYWHEREINOUTPUT');
  });
});

describe('GET /api/admin/stripe-ping — failure modes', () => {
  it('missing STRIPE_SECRET_KEY → 500 NO_KEY', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const res = await GET(buildRequest());
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('NO_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Stripe 401 (invalid key) → 500 STRIPE_ERR with detail + prefix', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_' + 'invalidkey'.repeat(7);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { message: 'Invalid API Key provided', type: 'invalid_request_error' },
        }),
        { status: 401 },
      ),
    );
    const res = await GET(buildRequest());
    expect(res.status).toBe(500);
    const body = (await res.json()) as {
      error: string;
      detail: string;
      status: number;
      prefix: string;
    };
    expect(body.error).toBe('STRIPE_ERR');
    expect(body.detail).toBe('Invalid API Key provided');
    expect(body.status).toBe(401);
    expect(body.prefix).toBe('sk_test');
  });

  it('network error → 502 NETWORK', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_' + 'a'.repeat(64);
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    const res = await GET(buildRequest());
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('NETWORK');
  });

  it('unauthenticated → 401', async () => {
    authMock.mockRejectedValueOnce(
      new AuthorizationError(401, 'UNAUTHENTICATED', 'Authentication required.'),
    );
    process.env.STRIPE_SECRET_KEY = 'sk_test_' + 'a'.repeat(64);
    const res = await GET(buildRequest());
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('non-admin → 403', async () => {
    authMock.mockRejectedValueOnce(
      new AuthorizationError(403, 'NOT_A_COMPANY_ADMIN', 'Not an admin.'),
    );
    process.env.STRIPE_SECRET_KEY = 'sk_test_' + 'a'.repeat(64);
    const res = await GET(buildRequest());
    expect(res.status).toBe(403);
  });
});
