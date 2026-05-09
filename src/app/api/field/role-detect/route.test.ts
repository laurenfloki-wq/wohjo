// CRACK 205 — unit tests for GET /api/field/role-detect
//
// Covers:
//   1. Already-linked worker (user_id match)  → 200 { role: 'worker' }
//   2. First-time worker (phone match)         → 200 { role: 'worker' }
//   3. Admin (user_id match in admins)         → 200 { role: 'admin'  }
//   4. No match in either table               → 404 NO_IDENTITY
//   5. No session                             → 401 UNAUTHENTICATED

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock references ──────────────────────────────────────────────────────────

const workerByIdMaybeSingle = vi.fn();
const workerByPhoneMaybeSingle = vi.fn();
const adminMaybeSingle = vi.fn();

// Track which table + which query form is being built so we can return
// the right mock. The route always calls:
//   workers (eq user_id)  → workerByIdMaybeSingle
//   workers (eq phone)    → workerByPhoneMaybeSingle
//   admins               → adminMaybeSingle
let workerEqCallCount = 0;

function makeWorkerChain(maybeSingleFn: () => unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => { chain.maybeSingle = maybeSingleFn; return chain; };
  chain.maybeSingle = maybeSingleFn;
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'user-uuid-1', phone: '61400111222' } },
        error: null,
      })),
    },
  })),
  createServiceClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'admins') {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.maybeSingle = adminMaybeSingle;
        return chain;
      }
      // workers — first call is by user_id, second is by phone
      workerEqCallCount += 1;
      const fn = workerEqCallCount === 1 ? workerByIdMaybeSingle : workerByPhoneMaybeSingle;
      return makeWorkerChain(fn);
    },
  })),
}));

import { GET } from './route';

function makeRequest(): Request {
  return new Request('http://localhost/api/field/role-detect');
}

beforeEach(() => {
  vi.clearAllMocks();
  workerEqCallCount = 0;
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('role-detect — already-linked worker', () => {
  it('returns 200 role=worker when user_id matches a worker row', async () => {
    workerByIdMaybeSingle.mockResolvedValue({ data: { id: 'wk-1' }, error: null });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ role: 'worker' });
    // Should not query by phone or admins once user_id match found.
    expect(workerByPhoneMaybeSingle).not.toHaveBeenCalled();
    expect(adminMaybeSingle).not.toHaveBeenCalled();
  });
});

describe('role-detect — first-time worker (phone match)', () => {
  it('returns 200 role=worker when phone matches but user_id does not', async () => {
    workerByIdMaybeSingle.mockResolvedValue({ data: null, error: null });
    workerByPhoneMaybeSingle.mockResolvedValue({ data: { id: 'wk-2' }, error: null });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ role: 'worker' });
    expect(adminMaybeSingle).not.toHaveBeenCalled();
  });
});

describe('role-detect — admin', () => {
  it('returns 200 role=admin when no worker row but admins row exists', async () => {
    workerByIdMaybeSingle.mockResolvedValue({ data: null, error: null });
    workerByPhoneMaybeSingle.mockResolvedValue({ data: null, error: null });
    adminMaybeSingle.mockResolvedValue({ data: { user_id: 'user-uuid-1' }, error: null });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ role: 'admin' });
  });
});

describe('role-detect — no identity', () => {
  it('returns 404 NO_IDENTITY when no worker or admin row exists', async () => {
    workerByIdMaybeSingle.mockResolvedValue({ data: null, error: null });
    workerByPhoneMaybeSingle.mockResolvedValue({ data: null, error: null });
    adminMaybeSingle.mockResolvedValue({ data: null, error: null });

    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'NO_IDENTITY' });
  });
});

describe('role-detect — unauthenticated', () => {
  it('returns 401 when no session', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: { message: 'no session' } })),
      },
    } as never);

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});
