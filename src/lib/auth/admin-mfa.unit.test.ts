import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Logger } from 'pino';

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockReturnValue({ from: fromMock }),
}));

import {
  assertAdminMfaSatisfied,
  confirmEnrolment,
  getAdminMfaStatus,
  startEnrolment,
  verifyAdminMfa,
} from './admin-mfa';
import { generateTotpSecret, hotp, currentStep } from './totp';

function makeLog(): { log: Logger; warns: string[]; errors: string[] } {
  const warns: string[] = [];
  const errors: string[] = [];
  const log = {
    info: vi.fn(),
    warn: (_o: unknown, msg: string) => { warns.push(msg); },
    error: (_o: unknown, msg: string) => { errors.push(msg); },
    debug: vi.fn(),
    child: vi.fn(),
  } as unknown as Logger;
  return { log, warns, errors };
}

// Self-chaining query node: every builder method returns the node; the
// terminal (maybeSingle/single/select-as-terminal) resolves `result`.
function chain(result: { data: unknown; error: unknown }) {
  const node: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gt', 'is', 'order', 'limit', 'update', 'insert', 'upsert']) {
    node[m] = vi.fn().mockImplementation(() => node);
  }
  node.maybeSingle = vi.fn().mockResolvedValue(result);
  node.single = vi.fn().mockResolvedValue(result);
  // for `.update(...).eq().eq().select()` -- final select resolves
  node.then = undefined;
  return node as Record<string, ReturnType<typeof vi.fn>> & { __result?: unknown };
}

// Table-keyed routing with per-call queues so a test can vary results.
function routeTables(map: Record<string, Array<{ data: unknown; error: unknown }>>) {
  const made: Record<string, unknown[]> = {};
  fromMock.mockImplementation((table: string) => {
    const queue = map[table];
    if (!queue || queue.length === 0) throw new Error(`unexpected from(${table})`);
    const result = queue.length > 1 ? queue.shift()! : queue[0];
    const node = chain(result);
    // update-chains terminate in .select() -- make select resolve too,
    // while still being chainable for read paths (read paths never await select).
    (node.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const p = Promise.resolve(result) as Promise<unknown> & Record<string, unknown>;
      p.eq = node.eq; p.gt = node.gt; p.order = node.order; p.limit = node.limit;
      p.maybeSingle = node.maybeSingle; p.single = node.single;
      return p;
    });
    (made[table] ??= []).push(node);
    return node;
  });
  return made;
}

beforeEach(() => { fromMock.mockReset(); });

const totpConfirmed = (secret: string, lastStep = 0) => ({
  user_id: 'u-1', secret_base32: secret, confirmed_at: '2026-06-01T00:00:00Z', last_used_step: lastStep,
});
const totpPending = (secret: string) => ({
  user_id: 'u-1', secret_base32: secret, confirmed_at: null, last_used_step: 0,
});

describe('assertAdminMfaSatisfied (graduated chokepoint)', () => {
  it('allows + warns when no secret row exists (not enrolled)', async () => {
    routeTables({ admin_mfa_totp: [{ data: null, error: null }] });
    const { log, warns } = makeLog();
    await expect(assertAdminMfaSatisfied(log, 'u-1')).resolves.toBeUndefined();
    expect(warns).toContain('admin.mfa.not_enrolled');
  });

  it('allows + warns when the secret is minted but unconfirmed', async () => {
    routeTables({ admin_mfa_totp: [{ data: totpPending('A'.repeat(32)), error: null }] });
    const { log, warns } = makeLog();
    await expect(assertAdminMfaSatisfied(log, 'u-1')).resolves.toBeUndefined();
    expect(warns).toContain('admin.mfa.not_enrolled');
  });

  it('throws 403 MFA_REQUIRED when confirmed but no active grant', async () => {
    routeTables({
      admin_mfa_totp: [{ data: totpConfirmed('A'.repeat(32)), error: null }],
      admin_mfa_grants: [{ data: null, error: null }],
    });
    const { log } = makeLog();
    await expect(assertAdminMfaSatisfied(log, 'u-1')).rejects.toMatchObject({
      status: 403, code: 'MFA_REQUIRED',
    });
  });

  it('passes when confirmed and an unexpired grant exists', async () => {
    routeTables({
      admin_mfa_totp: [{ data: totpConfirmed('A'.repeat(32)), error: null }],
      admin_mfa_grants: [{ data: { id: 'g-1', expires_at: '2099-01-01T00:00:00Z' }, error: null }],
    });
    const { log } = makeLog();
    await expect(assertAdminMfaSatisfied(log, 'u-1')).resolves.toBeUndefined();
  });

  it('fails OPEN with an error log when the lookup errors (no command-surface brick)', async () => {
    routeTables({ admin_mfa_totp: [{ data: null, error: { message: 'boom' } }] });
    const { log, errors } = makeLog();
    await expect(assertAdminMfaSatisfied(log, 'u-1')).resolves.toBeUndefined();
    expect(errors).toContain('admin.mfa.lookup_failed');
  });
});

describe('startEnrolment', () => {
  it('refuses with 409 once confirmed', async () => {
    routeTables({ admin_mfa_totp: [{ data: totpConfirmed('A'.repeat(32)), error: null }] });
    const { log } = makeLog();
    await expect(startEnrolment(log, 'u-1', 'admin@x.com')).rejects.toMatchObject({
      status: 409, code: 'MFA_ALREADY_ENROLLED',
    });
  });

  it('mints a fresh secret and returns an otpauth URI when not yet confirmed', async () => {
    const made = routeTables({
      admin_mfa_totp: [
        { data: null, error: null },   // fetch
        { data: null, error: null },   // upsert
      ],
    });
    const { log } = makeLog();
    const r = await startEnrolment(log, 'u-1', 'admin@x.com');
    expect(r.secretBase32).toMatch(/^[A-Z2-7]{32}$/);
    expect(r.otpauthUri).toContain('otpauth://totp/WOHJO%3Aadmin%40x.com');
    const upsertNode = made.admin_mfa_totp[1] as { upsert: ReturnType<typeof vi.fn> };
    expect(upsertNode.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u-1', confirmed_at: null, last_used_step: 0 }),
      { onConflict: 'user_id' },
    );
  });
});

describe('confirmEnrolment / verifyAdminMfa', () => {
  it('confirm: valid current code sets confirmed_at and mints a grant', async () => {
    const secret = generateTotpSecret();
    const code = hotp(secret, currentStep());
    const made = routeTables({
      admin_mfa_totp: [
        { data: totpPending(secret), error: null },        // fetch
        { data: [{ user_id: 'u-1' }], error: null },       // consumeStep update
      ],
      admin_mfa_grants: [
        { data: { id: 'g-1', expires_at: '2099-01-01T00:00:00Z' }, error: null }, // insert
      ],
    });
    const { log } = makeLog();
    const r = await confirmEnrolment(log, 'u-1', code);
    expect(r.grantExpiresAt).toBe('2099-01-01T00:00:00Z');
    const upd = made.admin_mfa_totp[1] as { update: ReturnType<typeof vi.fn> };
    expect(upd.update).toHaveBeenCalledWith(
      expect.objectContaining({ confirmed_at: expect.any(String) }),
    );
  });

  it('verify: wrong code -> 401 MFA_BAD_CODE', async () => {
    const secret = generateTotpSecret();
    routeTables({ admin_mfa_totp: [{ data: totpConfirmed(secret), error: null }] });
    const { log } = makeLog();
    await expect(verifyAdminMfa(log, 'u-1', '000000')).rejects.toMatchObject({
      status: 401, code: 'MFA_BAD_CODE',
    });
  });

  it('verify: replayed step -> 401 MFA_BAD_CODE (verifyTotp replay guard)', async () => {
    const secret = generateTotpSecret();
    const step = currentStep();
    const code = hotp(secret, step);
    routeTables({ admin_mfa_totp: [{ data: totpConfirmed(secret, step), error: null }] });
    const { log } = makeLog();
    await expect(verifyAdminMfa(log, 'u-1', code)).rejects.toMatchObject({
      status: 401, code: 'MFA_BAD_CODE',
    });
  });

  it('verify: concurrent consume loses the optimistic update -> 409 MFA_REPLAY', async () => {
    const secret = generateTotpSecret();
    const code = hotp(secret, currentStep());
    routeTables({
      admin_mfa_totp: [
        { data: totpConfirmed(secret), error: null },
        { data: [], error: null },     // consumeStep: zero rows updated
      ],
    });
    const { log } = makeLog();
    await expect(verifyAdminMfa(log, 'u-1', code)).rejects.toMatchObject({
      status: 409, code: 'MFA_REPLAY',
    });
  });

  it('verify: not enrolled -> 404 MFA_NOT_ENROLLED', async () => {
    routeTables({ admin_mfa_totp: [{ data: null, error: null }] });
    const { log } = makeLog();
    await expect(verifyAdminMfa(log, 'u-1', '123456')).rejects.toMatchObject({
      status: 404, code: 'MFA_NOT_ENROLLED',
    });
  });
});

describe('getAdminMfaStatus', () => {
  it('reports not-enrolled / pending / enrolled+grant states', async () => {
    routeTables({ admin_mfa_totp: [{ data: null, error: null }] });
    const { log } = makeLog();
    expect(await getAdminMfaStatus(log, 'u-1')).toEqual({
      enrolled: false, pending: false, grantActive: false, grantExpiresAt: null,
    });

    routeTables({ admin_mfa_totp: [{ data: totpPending('A'.repeat(32)), error: null }] });
    expect((await getAdminMfaStatus(log, 'u-1')).pending).toBe(true);

    routeTables({
      admin_mfa_totp: [{ data: totpConfirmed('A'.repeat(32)), error: null }],
      admin_mfa_grants: [{ data: { id: 'g', expires_at: '2099-01-01T00:00:00Z' }, error: null }],
    });
    const s = await getAdminMfaStatus(log, 'u-1');
    expect(s).toEqual({
      enrolled: true, pending: false, grantActive: true, grantExpiresAt: '2099-01-01T00:00:00Z',
    });
  });
});
