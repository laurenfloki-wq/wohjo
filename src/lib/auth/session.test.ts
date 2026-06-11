import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Logger } from 'pino';

// --- Mocks ------------------------------------------------------------

const { getUserMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
}));
const { serviceQueryMock } = vi.hoisted(() => ({
  serviceQueryMock: {
    from: vi.fn(),
  },
}));

vi.mock('@/lib/supabase/server', () => {
  return {
    createClient: vi.fn().mockResolvedValue({
      auth: { getUser: getUserMock },
    }),
    createServiceClient: vi.fn().mockReturnValue(serviceQueryMock),
  };
});

import {
  getAuthenticatedUser,
  getCompanyIdForSession,
  requireCompanyMembership,
  requireWorkerIdentity,
  requireWorkerOwnership,
} from './session';
import { AuthorizationError, isAuthorizationError } from './errors';

// --- Test harness -----------------------------------------------------

function makeLog(): { log: Logger; warns: unknown[][]; errors: unknown[][] } {
  const warns: unknown[][] = [];
  const errors: unknown[][] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const log = {
    info: vi.fn(),
    warn: (...args: unknown[]) => { warns.push(args); },
    error: (...args: unknown[]) => { errors.push(args); },
    debug: vi.fn(),
    child: vi.fn(),
  } as unknown as Logger;
  return { log, warns, errors };
}

// Self-chaining node for the admin_mfa_* lookups the W6(b) MFA check
// performs inside getCompanyIdForSession. Every builder method returns
// the node; maybeSingle resolves the supplied result.
function mfaChain(result: { data: unknown; error: unknown }) {
  const node: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gt', 'order', 'limit']) {
    node[m] = vi.fn().mockImplementation(() => node);
  }
  node.maybeSingle = vi.fn().mockResolvedValue(result);
  return node;
}

function mockAdminsSelect(
  resultData: unknown,
  resultError: unknown = null,
  mfa: { totpRow?: unknown; grantRow?: unknown } = {},
): void {
  const eq = vi.fn().mockResolvedValue({ data: resultData, error: resultError });
  const select = vi.fn().mockReturnValue({ eq });
  serviceQueryMock.from.mockImplementation((table: string) => {
    if (table === 'admins') return { select };
    // W6(b): the MFA chokepoint reads these two tables on every
    // membership resolution. Default = not enrolled (graduated pass).
    if (table === 'admin_mfa_totp') return mfaChain({ data: mfa.totpRow ?? null, error: null });
    if (table === 'admin_mfa_grants') return mfaChain({ data: mfa.grantRow ?? null, error: null });
    throw new Error(`unexpected from(${table})`);
  });
}

function mockWorkersSelect(row: unknown, error: unknown = null): void {
  // .from('workers').select(...).eq(...).eq(...).maybeSingle()
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error });
  const eq2 = vi.fn().mockReturnValue({ maybeSingle });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  serviceQueryMock.from.mockImplementation((table: string) => {
    if (table === 'workers') return { select };
    throw new Error(`unexpected from(${table})`);
  });
}

beforeEach(() => {
  getUserMock.mockReset();
  serviceQueryMock.from.mockReset();
});

// --- getAuthenticatedUser --------------------------------------------

describe('getAuthenticatedUser', () => {
  it('returns the user when supabase.auth.getUser succeeds', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u-1', phone: '+61400000001' } }, error: null });
    const { log } = makeLog();
    const user = await getAuthenticatedUser(log);
    expect(user.id).toBe('u-1');
  });

  it('throws AuthorizationError(401 UNAUTHENTICATED) + logs WARN when no session', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const { log, warns } = makeLog();
    await expect(getAuthenticatedUser(log)).rejects.toSatisfy((err) => {
      return isAuthorizationError(err) && err.status === 401 && err.code === 'UNAUTHENTICATED';
    });
    expect(warns.length).toBe(1);
    expect(warns[0][1]).toBe('auth.session.missing');
  });
});

// --- getCompanyIdForSession ------------------------------------------

describe('getCompanyIdForSession', () => {
  it('returns {userId, companyId, role} on single admins row', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    mockAdminsSelect([{ user_id: 'u-1', company_id: 'acme-co', role: 'director' }]);
    const { log } = makeLog();
    const m = await getCompanyIdForSession(log);
    expect(m).toEqual({ userId: 'u-1', companyId: 'acme-co', role: 'director' });
  });

  it('throws 403 NOT_A_COMPANY_ADMIN when zero admins rows', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u-nobody' } }, error: null });
    mockAdminsSelect([]);
    const { log, warns } = makeLog();
    await expect(getCompanyIdForSession(log)).rejects.toMatchObject({
      status: 403,
      code: 'NOT_A_COMPANY_ADMIN',
    });
    expect(warns.some((w) => w[1] === 'auth.admins.no_membership')).toBe(true);
  });

  it('throws 400 AMBIGUOUS_MEMBERSHIP when user admins multiple companies', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    mockAdminsSelect([
      { user_id: 'u-1', company_id: 'acme-co', role: 'director' },
      { user_id: 'u-1', company_id: 'bravo-co', role: 'director' },
    ]);
    const { log, warns } = makeLog();
    await expect(getCompanyIdForSession(log)).rejects.toMatchObject({
      status: 400,
      code: 'AMBIGUOUS_MEMBERSHIP',
    });
    expect(warns.some((w) => w[1] === 'auth.admins.ambiguous_membership')).toBe(true);
  });

  it('throws 500 ADMINS_LOOKUP_FAILED on DB error', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    mockAdminsSelect(null, { message: 'relation admins does not exist' });
    const { log } = makeLog();
    await expect(getCompanyIdForSession(log)).rejects.toMatchObject({
      status: 500,
      code: 'ADMINS_LOOKUP_FAILED',
    });
  });

  // --- W6(b) graduated TOTP MFA at the chokepoint -------------------

  const adminRow = [{ user_id: 'u-1', company_id: 'acme-co', role: 'director' }];
  const confirmedTotp = {
    user_id: 'u-1', secret_base32: 'A'.repeat(32),
    confirmed_at: '2026-06-01T00:00:00Z', last_used_step: 0,
  };

  it('W6(b): not-enrolled admin passes with the graduated warn-log', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    mockAdminsSelect(adminRow); // default mfa: no totp row
    const { log, warns } = makeLog();
    const m = await getCompanyIdForSession(log);
    expect(m.companyId).toBe('acme-co');
    expect(warns.some((w) => w[1] === 'admin.mfa.not_enrolled')).toBe(true);
  });

  it('W6(b): confirmed-TOTP admin WITHOUT an active grant gets 403 MFA_REQUIRED', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    mockAdminsSelect(adminRow, null, { totpRow: confirmedTotp, grantRow: null });
    const { log } = makeLog();
    await expect(getCompanyIdForSession(log)).rejects.toMatchObject({
      status: 403,
      code: 'MFA_REQUIRED',
    });
  });

  it('W6(b): confirmed-TOTP admin WITH an active grant passes', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    mockAdminsSelect(adminRow, null, {
      totpRow: confirmedTotp,
      grantRow: { id: 'g-1', expires_at: '2099-01-01T00:00:00Z' },
    });
    const { log } = makeLog();
    const m = await getCompanyIdForSession(log);
    expect(m.companyId).toBe('acme-co');
  });

  it('W6(b): skipMfaCheck bypasses the MFA assert (MFA routes only)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    mockAdminsSelect(adminRow, null, { totpRow: confirmedTotp, grantRow: null });
    const { log } = makeLog();
    const m = await getCompanyIdForSession(log, { skipMfaCheck: true });
    expect(m.companyId).toBe('acme-co');
  });
});

// --- requireCompanyMembership ----------------------------------------

describe('requireCompanyMembership', () => {
  it('returns membership when targetCompanyId matches session companyId', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    mockAdminsSelect([{ user_id: 'u-1', company_id: 'acme-co', role: 'director' }]);
    const { log } = makeLog();
    const m = await requireCompanyMembership(log, 'acme-co');
    expect(m.companyId).toBe('acme-co');
  });

  it('throws 403 FORBIDDEN_COMPANY + logs cross-tenant attempt on mismatch', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    mockAdminsSelect([{ user_id: 'u-1', company_id: 'acme-co', role: 'director' }]);
    const { log, warns } = makeLog();
    await expect(requireCompanyMembership(log, 'bravo-co')).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN_COMPANY',
    });
    const mismatch = warns.find((w) => w[1] === 'auth.company_membership.mismatch');
    expect(mismatch).toBeDefined();
    expect(mismatch![0]).toMatchObject({
      userId: 'u-1',
      actualCompanyId: 'acme-co',
      targetCompanyId: 'bravo-co',
    });
  });
});

// --- requireWorkerIdentity -------------------------------------------

describe('requireWorkerIdentity', () => {
  it('returns worker identity when workers row linked to user', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u-2', phone: '+61400000002' } }, error: null });
    mockWorkersSelect({ id: 'worker-x', company_id: 'acme-co', phone: '+61400000002' });
    const { log } = makeLog();
    const identity = await requireWorkerIdentity(log);
    expect(identity).toEqual({
      userId: 'u-2',
      workerId: 'worker-x',
      companyId: 'acme-co',
      phone: '+61400000002',
    });
  });

  it('throws 403 NOT_A_WORKER when no active workers row', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u-ghost', phone: '+61400999999' } }, error: null });
    mockWorkersSelect(null);
    const { log, warns } = makeLog();
    await expect(requireWorkerIdentity(log)).rejects.toMatchObject({
      status: 403,
      code: 'NOT_A_WORKER',
    });
    expect(warns.some((w) => w[1] === 'auth.workers.no_identity')).toBe(true);
  });

  it('throws 500 WORKERS_LOOKUP_FAILED on DB error', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u-2', phone: '+61400000002' } }, error: null });
    mockWorkersSelect(null, { message: 'timeout' });
    const { log } = makeLog();
    await expect(requireWorkerIdentity(log)).rejects.toMatchObject({
      status: 500,
      code: 'WORKERS_LOOKUP_FAILED',
    });
  });
});

// --- requireWorkerOwnership ------------------------------------------

describe('requireWorkerOwnership', () => {
  it('returns identity when targetWorkerId matches own worker.id', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u-2', phone: '+61400000002' } }, error: null });
    mockWorkersSelect({ id: 'worker-x', company_id: 'acme-co', phone: '+61400000002' });
    const { log } = makeLog();
    const r = await requireWorkerOwnership(log, 'worker-x');
    expect(r.workerId).toBe('worker-x');
  });

  it('throws 403 FORBIDDEN_WORKER + logs cross-worker attempt on mismatch', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u-2', phone: '+61400000002' } }, error: null });
    mockWorkersSelect({ id: 'worker-x', company_id: 'acme-co', phone: '+61400000002' });
    const { log, warns } = makeLog();
    await expect(requireWorkerOwnership(log, 'worker-other')).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN_WORKER',
    });
    const mismatch = warns.find((w) => w[1] === 'auth.worker_ownership.mismatch');
    expect(mismatch).toBeDefined();
    expect(mismatch![0]).toMatchObject({
      userId: 'u-2',
      actualWorkerId: 'worker-x',
      targetWorkerId: 'worker-other',
    });
  });
});

// --- AuthorizationError exports ---------------------------------------

describe('AuthorizationError / isAuthorizationError', () => {
  it('preserves status + code on the thrown error', () => {
    const e = new AuthorizationError(403, 'X', 'msg');
    expect(isAuthorizationError(e)).toBe(true);
    expect(e.status).toBe(403);
    expect(e.code).toBe('X');
  });
  it('type-guard is false for plain Error', () => {
    expect(isAuthorizationError(new Error('nope'))).toBe(false);
  });
});
