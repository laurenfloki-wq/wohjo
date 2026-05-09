// CRACK 106 — unit tests for the Auth Hook route handler.
//
// Covers:
//   1. Invalid / missing signature → 401
//   2. Valid signature, admin actor → 200 ok
//   3. Valid signature, worker actor (no admin row) → 200 ok
//   4. Duplicate delivery (23505) → 200 ok (idempotent)
//   5. Insert error (non-conflict) → 200 ok (auth must not be blocked)

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module-level mock references ─────────────────────────────────────────────

const insertMock = vi.fn();
const adminMaybeSingle = vi.fn();
const workerMaybeSingle = vi.fn();

vi.mock('./signature', () => ({
  verifySupabaseHookSignature: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => {
      const base = { select: () => base, eq: () => base };
      if (table === 'admins') return { ...base, maybeSingle: adminMaybeSingle };
      if (table === 'workers') return { ...base, maybeSingle: workerMaybeSingle };
      return { insert: insertMock };
    },
  })),
}));

import { POST } from './route';
import { verifySupabaseHookSignature } from './signature';

const mockVerify = vi.mocked(verifySupabaseHookSignature);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/auth/events/hook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-supabase-signature': 'any-sig',
    },
    body: JSON.stringify(body),
  });
}

const basePayload = {
  id: 'evt-abc-123',
  event: 'SIGNED_IN',
  occurred_at: '2026-05-09T10:00:00Z',
  user: { id: 'user-uuid-1', email: 'joao@example.com' },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  process.env.SUPABASE_HOOK_SECRET = 'test-secret';
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Auth Hook — signature validation', () => {
  it('returns 401 when signature is invalid', async () => {
    mockVerify.mockReturnValue(false);
    const res = await POST(makeRequest(basePayload));
    expect(res.status).toBe(401);
  });

  it('returns 401 when signature header is missing', async () => {
    mockVerify.mockReturnValue(false);
    const req = new Request('http://localhost/api/auth/events/hook', {
      method: 'POST',
      body: JSON.stringify(basePayload),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

describe('Auth Hook — admin actor', () => {
  it('inserts and returns 200 when actor is an admin', async () => {
    mockVerify.mockReturnValue(true);
    adminMaybeSingle.mockResolvedValue({ data: { company_id: 'co-1' }, error: null });
    insertMock.mockResolvedValue({ error: null });

    const res = await POST(makeRequest(basePayload));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(insertMock).toHaveBeenCalledOnce();
  });
});

describe('Auth Hook — worker actor (no admin row)', () => {
  it('falls back to workers lookup and returns 200', async () => {
    mockVerify.mockReturnValue(true);
    adminMaybeSingle.mockResolvedValue({ data: null, error: null });
    workerMaybeSingle.mockResolvedValue({ data: { company_id: 'co-2' }, error: null });
    insertMock.mockResolvedValue({ error: null });

    const res = await POST(makeRequest(basePayload));
    expect(res.status).toBe(200);
    expect(insertMock).toHaveBeenCalledOnce();
  });
});

describe('Auth Hook — idempotency', () => {
  it('returns 200 ok on duplicate delivery (23505 unique violation)', async () => {
    mockVerify.mockReturnValue(true);
    adminMaybeSingle.mockResolvedValue({ data: null, error: null });
    workerMaybeSingle.mockResolvedValue({ data: null, error: null });
    insertMock.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } });

    const res = await POST(makeRequest(basePayload));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });
});

describe('Auth Hook — insert failure is non-fatal', () => {
  it('returns 200 even when insert fails (auth must not be blocked)', async () => {
    mockVerify.mockReturnValue(true);
    adminMaybeSingle.mockResolvedValue({ data: null, error: null });
    workerMaybeSingle.mockResolvedValue({ data: null, error: null });
    insertMock.mockResolvedValue({ error: { code: '42P01', message: 'relation missing' } });

    const res = await POST(makeRequest(basePayload));
    expect(res.status).toBe(200);
  });
});
