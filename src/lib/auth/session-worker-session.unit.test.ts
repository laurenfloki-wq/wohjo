// W2(2) — chokepoint acceptance of the passkey worker-session.
// Security boundary: the self-issued worker-session cookie resolves WORKER
// identity when there is no Supabase session, but NEVER grants admin identity.

import { describe, it, expect, vi, beforeEach } from 'vitest';

let supabaseUser: { id: string; phone?: string } | null = null;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: async () => ({
        data: { user: supabaseUser },
        error: supabaseUser ? null : { message: 'no session' },
      }),
    },
  })),
  createServiceClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          // workers path: .eq().eq().maybeSingle()
          eq: () => ({
            maybeSingle: async () =>
              table === 'workers'
                ? {
                    data: { id: 'worker-9', company_id: 'co-9', phone: '+61400000000' },
                    error: null,
                  }
                : { data: null, error: null },
          }),
          // admins path: .eq() then array result (not reached without a Supabase user)
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  }),
}));

vi.mock('@/lib/auth/worker-session', () => ({
  readWorkerSessionCookie: vi.fn(),
  workerPasskeyLoginEnabled: vi.fn(() => true),
}));
vi.mock('@/lib/auth/admin-mfa', () => ({ assertAdminMfaSatisfied: vi.fn(async () => undefined) }));

import { requireWorkerIdentity, getCompanyIdForSession } from './session';
import { readWorkerSessionCookie, workerPasskeyLoginEnabled } from './worker-session';

const log = { warn: vi.fn(), error: vi.fn(), info: vi.fn() } as never;

beforeEach(() => {
  vi.clearAllMocks();
  supabaseUser = null;
  (workerPasskeyLoginEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
});

describe('requireWorkerIdentity — worker-session cookie acceptance', () => {
  it('resolves the worker from a valid cookie when there is NO Supabase session', async () => {
    (readWorkerSessionCookie as ReturnType<typeof vi.fn>).mockResolvedValue({
      uid: 'user-9',
      wid: 'worker-9',
      exp: 9e15,
    });
    const id = await requireWorkerIdentity(log);
    expect(id).toMatchObject({ userId: 'user-9', workerId: 'worker-9', companyId: 'co-9' });
  });

  it('prefers the Supabase session when present (cookie not consulted)', async () => {
    supabaseUser = { id: 'user-supa' };
    const id = await requireWorkerIdentity(log);
    expect(id.userId).toBe('user-supa');
    expect(readWorkerSessionCookie).not.toHaveBeenCalled();
  });

  it('401 when neither a Supabase session nor a worker cookie is present', async () => {
    (readWorkerSessionCookie as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(requireWorkerIdentity(log)).rejects.toMatchObject({ status: 401 });
  });

  it('ignores the cookie entirely when the feature is off (flag/secret absent)', async () => {
    (workerPasskeyLoginEnabled as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (readWorkerSessionCookie as ReturnType<typeof vi.fn>).mockResolvedValue({
      uid: 'user-9',
      wid: 'worker-9',
      exp: 9e15,
    });
    await expect(requireWorkerIdentity(log)).rejects.toMatchObject({ status: 401 });
    expect(readWorkerSessionCookie).not.toHaveBeenCalled();
  });
});

describe('admin auth NEVER accepts the worker-session cookie', () => {
  it('getCompanyIdForSession throws 401 with no Supabase session even if a worker cookie exists', async () => {
    (readWorkerSessionCookie as ReturnType<typeof vi.fn>).mockResolvedValue({
      uid: 'user-9',
      wid: 'worker-9',
      exp: 9e15,
    });
    await expect(getCompanyIdForSession(log)).rejects.toMatchObject({ status: 401 });
    // The admin path must not even look at the worker cookie.
    expect(readWorkerSessionCookie).not.toHaveBeenCalled();
  });
});
