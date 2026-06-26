// W2(2) — openAuthVerify behaviour (discoverable app-open assertion → worker).
// Lockout matrix: happy path (1), assertion fail (5), no-credential (7),
// deactivated worker. The repo + WebAuthn verification are mocked; this pins the
// control flow that decides whether a session is minted.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const grantInsert = vi.fn(async () => ({ error: null }));
const challengeInsert = vi.fn(() => ({
  select: () => ({ single: async () => ({ data: { id: 'chal-row' }, error: null }) }),
}));

vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(async () => ({ challenge: 'CH', allowCredentials: [] })),
  verifyAuthenticationResponse: vi.fn(),
}));
vi.mock('@simplewebauthn/server/helpers', () => ({
  isoBase64URL: {
    toBuffer: (s: string) => Buffer.from(s),
    fromBuffer: (b: Buffer) => b.toString(),
    fromUTF8String: (s: string) => s,
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (t: string) => {
      if (t === 'worker_webauthn_challenges') return { insert: challengeInsert };
      if (t === 'worker_mfa_grants') return { insert: grantInsert };
      return {};
    },
  }),
}));
vi.mock('@/lib/auth/worker-passkey', () => ({
  getActiveCredentialByCredentialId: vi.fn(),
  getActiveWorkerUserId: vi.fn(),
  recordAssertion: vi.fn(async () => undefined),
  isSignCountRegression: (stored: number, asserted: number) =>
    !(stored === 0 && asserted === 0) && asserted <= stored,
  getActiveCredentials: vi.fn(),
  getActiveCredentialById: vi.fn(),
  insertCredential: vi.fn(),
}));

import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import * as repo from '@/lib/auth/worker-passkey';
import { openAuthVerify } from './worker-passkey-ceremony';

const RESPONSE = { id: 'cred-1', rawId: 'cred-1', response: {}, type: 'public-key' } as never;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.flosmosis.com';
  (repo.getActiveCredentialByCredentialId as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 'row-1',
    workerId: 'worker-1',
    credentialId: 'cred-1',
    publicKey: 'pk',
    signCount: 2,
    status: 'active',
    deviceLabel: null,
    deviceFingerprint: null,
  });
  (repo.getActiveWorkerUserId as ReturnType<typeof vi.fn>).mockResolvedValue('user-1');
});

describe('openAuthVerify', () => {
  it('1. happy path → verified, resolves worker + user, records + mints grant', async () => {
    (verifyAuthenticationResponse as ReturnType<typeof vi.fn>).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 3 },
    });
    const r = await openAuthVerify(RESPONSE, 'CH', 'ua-bind');
    expect(r).toEqual({ verified: true, workerId: 'worker-1', userId: 'user-1' });
    expect(repo.recordAssertion).toHaveBeenCalledWith('row-1', 3);
    expect(grantInsert).toHaveBeenCalledTimes(1);
  });

  it('7. unknown credential (discoverable lookup empty) → not verified, no session', async () => {
    (repo.getActiveCredentialByCredentialId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const r = await openAuthVerify(RESPONSE, 'CH', 'ua');
    expect(r.verified).toBe(false);
    expect(r.userId).toBeUndefined();
    expect(grantInsert).not.toHaveBeenCalled();
  });

  it('deactivated worker (no active user_id) → not verified, no session', async () => {
    (repo.getActiveWorkerUserId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const r = await openAuthVerify(RESPONSE, 'CH', 'ua');
    expect(r.verified).toBe(false);
    expect(verifyAuthenticationResponse).not.toHaveBeenCalled();
  });

  it('5a. assertion verification fails → not verified, no grant', async () => {
    (verifyAuthenticationResponse as ReturnType<typeof vi.fn>).mockResolvedValue({
      verified: false,
    });
    const r = await openAuthVerify(RESPONSE, 'CH', 'ua');
    expect(r.verified).toBe(false);
    expect(repo.recordAssertion).not.toHaveBeenCalled();
    expect(grantInsert).not.toHaveBeenCalled();
  });

  it('5b. sign-count regression (clone/replay) → not verified, no grant', async () => {
    // stored signCount = 2; asserted newCounter = 2 → regression.
    (verifyAuthenticationResponse as ReturnType<typeof vi.fn>).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 2 },
    });
    const r = await openAuthVerify(RESPONSE, 'CH', 'ua');
    expect(r.verified).toBe(false);
    expect(repo.recordAssertion).not.toHaveBeenCalled();
    expect(grantInsert).not.toHaveBeenCalled();
  });

  it('verification throwing is swallowed → not verified', async () => {
    (verifyAuthenticationResponse as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('bad'));
    const r = await openAuthVerify(RESPONSE, 'CH', 'ua');
    expect(r.verified).toBe(false);
  });
});
