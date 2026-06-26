// W2(2) — worker app-session crypto (the security core of passkey login).
// Pure sign/verify (no cookie I/O): round-trip, tamper, expiry, secret-gating.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  signWorkerSession,
  verifyWorkerSessionToken,
  signOpenChallenge,
  verifyOpenChallenge,
  workerPasskeyLoginEnabled,
} from './worker-session';

const SECRET = 'test-worker-session-secret-0123456789';
const NOW = 1_750_000_000_000;

beforeEach(() => {
  process.env.WORKER_SESSION_SECRET = SECRET;
  process.env.WORKER_PASSKEY_ACCESS = 'true';
});
afterEach(() => {
  delete process.env.WORKER_SESSION_SECRET;
  delete process.env.WORKER_PASSKEY_ACCESS;
});

describe('worker-session token', () => {
  it('round-trips uid + wid within TTL', () => {
    const t = signWorkerSession({ uid: 'u1', wid: 'w1' }, NOW);
    const claims = verifyWorkerSessionToken(t, NOW + 1000);
    expect(claims).toMatchObject({ uid: 'u1', wid: 'w1' });
    expect(claims!.exp).toBeGreaterThan(NOW);
  });

  it('rejects a tampered payload', () => {
    const t = signWorkerSession({ uid: 'u1', wid: 'w1' }, NOW);
    const [payload, mac] = t.split('.');
    // Flip the payload to another worker, keep the old mac.
    const forged =
      Buffer.from(JSON.stringify({ uid: 'u1', wid: 'EVIL', exp: NOW + 1e7 }))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '') +
      '.' +
      mac;
    expect(verifyWorkerSessionToken(forged, NOW + 1000)).toBeNull();
    expect(payload).toBeTruthy();
  });

  it('rejects an expired token', () => {
    const t = signWorkerSession({ uid: 'u1', wid: 'w1' }, NOW);
    // 12h + 1ms later
    expect(verifyWorkerSessionToken(t, NOW + 12 * 60 * 60 * 1000 + 1)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const t = signWorkerSession({ uid: 'u1', wid: 'w1' }, NOW);
    process.env.WORKER_SESSION_SECRET = 'a-totally-different-secret-value-xyz';
    expect(verifyWorkerSessionToken(t, NOW + 1000)).toBeNull();
  });

  it('verify returns null when no secret is configured', () => {
    const t = signWorkerSession({ uid: 'u1', wid: 'w1' }, NOW);
    delete process.env.WORKER_SESSION_SECRET;
    expect(verifyWorkerSessionToken(t, NOW + 1000)).toBeNull();
  });

  it('sign throws when no secret is configured', () => {
    delete process.env.WORKER_SESSION_SECRET;
    expect(() => signWorkerSession({ uid: 'u1', wid: 'w1' }, NOW)).toThrow();
  });

  it('rejects malformed tokens', () => {
    expect(verifyWorkerSessionToken('', NOW)).toBeNull();
    expect(verifyWorkerSessionToken('nodot', NOW)).toBeNull();
    expect(verifyWorkerSessionToken('.onlymac', NOW)).toBeNull();
  });
});

describe('open-challenge token', () => {
  it('round-trips the challenge within TTL', () => {
    const t = signOpenChallenge('chal-abc', NOW);
    expect(verifyOpenChallenge(t, NOW + 1000)).toBe('chal-abc');
  });
  it('rejects an expired challenge (>5min)', () => {
    const t = signOpenChallenge('chal-abc', NOW);
    expect(verifyOpenChallenge(t, NOW + 5 * 60 * 1000 + 1)).toBeNull();
  });
  it('rejects a tampered challenge', () => {
    const t = signOpenChallenge('chal-abc', NOW);
    const mac = t.split('.')[1];
    const forged =
      Buffer.from(JSON.stringify({ c: 'chal-EVIL', exp: NOW + 1e7 }))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '') +
      '.' +
      mac;
    expect(verifyOpenChallenge(forged, NOW + 1000)).toBeNull();
  });
});

describe('workerPasskeyLoginEnabled gating', () => {
  it('true only when flag on AND secret set', () => {
    expect(workerPasskeyLoginEnabled()).toBe(true);
  });
  it('false when the secret is missing', () => {
    delete process.env.WORKER_SESSION_SECRET;
    expect(workerPasskeyLoginEnabled()).toBe(false);
  });
  it('false when the flag is off', () => {
    process.env.WORKER_PASSKEY_ACCESS = 'false';
    expect(workerPasskeyLoginEnabled()).toBe(false);
  });
  it('false when the secret is too short to be real', () => {
    process.env.WORKER_SESSION_SECRET = 'short';
    expect(workerPasskeyLoginEnabled()).toBe(false);
  });
});
