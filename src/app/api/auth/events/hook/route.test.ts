// CRACK 203 — unit tests for the Auth Hook route handler (Standard Webhooks).
//
// Covers:
//   1. Invalid / missing signature → 200 + {claims:{}} (never block auth)
//   2. Valid signature, admin actor → 200 + {claims:{}}
//   3. Valid signature, worker actor (no admin row) → 200 + {claims:{}}
//   4. Duplicate delivery (23505) → 200 (idempotent)
//   5. Insert error (non-conflict) → 200 (auth must not be blocked)
//   6. JWT Claims passthrough — existing claims returned unchanged

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
      if (table === 'admins') {
        const chain = { select: () => chain, eq: () => chain, maybeSingle: adminMaybeSingle };
        return chain;
      }
      if (table === 'workers') {
        const chain = { select: () => chain, eq: () => chain, maybeSingle: workerMaybeSingle };
        return chain;
      }
      return { insert: insertMock };
    },
  })),
}));

import { POST } from './route';
import { verifySupabaseHookSignature } from './signature';

const mockVerify = vi.mocked(verifySupabaseHookSignature);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown, overrideClaims?: Record<string, unknown>): Request {
  const payload = overrideClaims ? { ...body as object, claims: overrideClaims } : body;
  return new Request('http://localhost/api/auth/events/hook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'svix-id': 'msg_2abc',
      'svix-timestamp': '1715252400',
      'svix-signature': 'v1,dGVzdHNpZw==',
    },
    body: JSON.stringify(payload),
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
  process.env.SUPABASE_HOOK_SECRET = 'v1,whsec_dGVzdHNlY3JldA==';
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Auth Hook — signature validation (always 200)', () => {
  it('returns 200 with empty claims when signature is invalid', async () => {
    mockVerify.mockReturnValue(false);
    const res = await POST(makeRequest(basePayload));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ claims: {} });
  });

  it('returns 200 with empty claims when svix headers are missing', async () => {
    mockVerify.mockReturnValue(false);
    const req = new Request('http://localhost/api/auth/events/hook', {
      method: 'POST',
      body: JSON.stringify(basePayload),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ claims: {} });
  });
});

describe('Auth Hook — admin actor', () => {
  it('inserts and returns 200 with claims passthrough when actor is an admin', async () => {
    mockVerify.mockReturnValue(true);
    adminMaybeSingle.mockResolvedValue({ data: { company_id: 'co-1' }, error: null });
    insertMock.mockResolvedValue({ error: null });

    const res = await POST(makeRequest(basePayload));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ claims: {} });
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
  it('returns 200 on duplicate delivery (23505 unique violation)', async () => {
    mockVerify.mockReturnValue(true);
    adminMaybeSingle.mockResolvedValue({ data: null, error: null });
    workerMaybeSingle.mockResolvedValue({ data: null, error: null });
    insertMock.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } });

    const res = await POST(makeRequest(basePayload));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ claims: {} });
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

describe('Auth Hook — JWT Claims passthrough', () => {
  it('returns existing claims unchanged', async () => {
    mockVerify.mockReturnValue(true);
    adminMaybeSingle.mockResolvedValue({ data: null, error: null });
    workerMaybeSingle.mockResolvedValue({ data: null, error: null });
    insertMock.mockResolvedValue({ error: null });

    const existingClaims = { role: 'admin', org_id: 'org-999' };
    const res = await POST(makeRequest(basePayload, existingClaims));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ claims: existingClaims });
  });
});

describe('Auth Hook — body read failure', () => {
  it('returns 200 with empty claims when req.text() throws', async () => {
    const req = {
      text: async () => { throw new Error('stream error'); },
      headers: { get: () => null },
    } as unknown as Request;
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ claims: {} });
  });
});

describe('Auth Hook — company lookup exception', () => {
  it('returns 200 and still inserts when company lookup throws', async () => {
    mockVerify.mockReturnValue(true);
    adminMaybeSingle.mockRejectedValue(new Error('db timeout'));
    insertMock.mockResolvedValue({ error: null });

    const res = await POST(makeRequest(basePayload));
    expect(res.status).toBe(200);
    // Insert still proceeds with companyId=null
    expect(insertMock).toHaveBeenCalledOnce();
  });
});
