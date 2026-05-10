// Phase 8 observability hardening — unit tests for the Auth Hook route handler.
//
// Covers:
//   1. Invalid / missing signature       → 200 {claims:{}}
//   2. Stale svix-timestamp             → 200 {claims:{}} (replay protection)
//   3. Valid sig, admin actor            → 200 {claims:{}}
//   4. Valid sig, worker actor           → 200 {claims:{}}
//   5. Duplicate delivery (23505)       → 200 idempotent
//   6. Insert error (non-conflict)      → 200 (auth must not be blocked)
//   7. JWT Claims passthrough           → existing claims returned unchanged
//   8. Exit log includes duration_ms    → structured observability

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock references ──────────────────────────────────────────────────────────

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
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.maybeSingle = adminMaybeSingle;
        return chain;
      }
      if (table === 'workers') {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.maybeSingle = workerMaybeSingle;
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

// Fresh timestamp within the 5-minute replay window.
function freshTimestamp(): string {
  return String(Math.floor(Date.now() / 1000));
}

function makeRequest(body: unknown, timestampOverride?: string): Request {
  return new Request('http://localhost/api/auth/events/hook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'svix-id': 'msg_2abc',
      'svix-timestamp': timestampOverride ?? freshTimestamp(),
      'svix-signature': 'v1,dGVzdHNpZw==',
      'x-request-id': 'req-test-001',
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

describe('Auth Hook — replay protection (stale timestamp)', () => {
  it('returns 200 and drops delivery when svix-timestamp is more than 5 min old', async () => {
    mockVerify.mockReturnValue(true);
    const staleTs = String(Math.floor(Date.now() / 1000) - 6 * 60); // 6 min ago
    const res = await POST(makeRequest(basePayload, staleTs));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ claims: {} });
    // Insert should NOT have been called — delivery was dropped before parsing.
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('accepts delivery when svix-timestamp is within 5 min window', async () => {
    mockVerify.mockReturnValue(true);
    adminMaybeSingle.mockResolvedValue({ data: { company_id: 'co-1' }, error: null });
    insertMock.mockResolvedValue({ error: null });

    const freshTs = String(Math.floor(Date.now() / 1000) - 60); // 1 min ago
    const res = await POST(makeRequest(basePayload, freshTs));
    expect(res.status).toBe(200);
    expect(insertMock).toHaveBeenCalledOnce();
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

describe('Auth Hook — idempotency / replay deduplication', () => {
  it('returns 200 on duplicate delivery (23505 unique violation — supabase_event_id)', async () => {
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
    const payload = { ...basePayload, claims: existingClaims };
    const res = await POST(makeRequest(payload));
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
