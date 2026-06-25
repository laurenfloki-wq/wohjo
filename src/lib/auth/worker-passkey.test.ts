import { describe, it, expect, vi, afterEach } from 'vitest';
import { isSignCountRegression, workerPasskeyAccessEnabled } from './worker-passkey';

describe('worker passkey — sign-count clone/replay rejection (Phase A)', () => {
  it('rejects a counter that does not advance past a non-zero stored value', () => {
    expect(isSignCountRegression(5, 5)).toBe(true); // replay (no advance)
    expect(isSignCountRegression(5, 4)).toBe(true); // regression (clone)
    expect(isSignCountRegression(5, 0)).toBe(true); // reset to 0 after non-zero
  });

  it('accepts a strictly-advancing counter', () => {
    expect(isSignCountRegression(5, 6)).toBe(false);
    expect(isSignCountRegression(0, 1)).toBe(false); // first real increment
  });

  it('allows the counterless-authenticator case (0 stored, 0 asserted)', () => {
    // Many platform authenticators always report 0; we cannot clone-detect on
    // them, so 0/0 must not be treated as a regression.
    expect(isSignCountRegression(0, 0)).toBe(false);
  });
});

describe('worker passkey — flag is off unless explicitly enabled', () => {
  afterEach(() => {
    delete process.env.WORKER_PASSKEY_ACCESS;
  });

  it('off by default', () => {
    delete process.env.WORKER_PASSKEY_ACCESS;
    expect(workerPasskeyAccessEnabled()).toBe(false);
  });

  it('off for any value other than the exact string "true"', () => {
    process.env.WORKER_PASSKEY_ACCESS = 'True';
    expect(workerPasskeyAccessEnabled()).toBe(false);
    process.env.WORKER_PASSKEY_ACCESS = '1';
    expect(workerPasskeyAccessEnabled()).toBe(false);
  });

  it('on only for exactly "true"', () => {
    process.env.WORKER_PASSKEY_ACCESS = 'true';
    expect(workerPasskeyAccessEnabled()).toBe(true);
  });
});

// Repository seam — confirm the service-client surface is used (not the raw
// client) and the queries are worker-scoped. A light mock mirrors the
// entitlement.test.ts pattern.
const { serviceClientMock } = vi.hoisted(() => ({ serviceClientMock: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: serviceClientMock }));

describe('worker passkey — credential repo is worker-scoped', () => {
  afterEach(() => vi.clearAllMocks());

  it('getActiveCredentials filters by worker_id AND status=active', async () => {
    const eqCalls: Array<[string, unknown]> = [];
    const chain = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        eqCalls.push([col, val]);
        return chain;
      },
      then: undefined,
    } as never;
    // resolve the awaited query
    (chain as { eq: unknown }).eq = (col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return eqCalls.length >= 2 ? Promise.resolve({ data: [], error: null }) : (chain as never);
    };
    serviceClientMock.mockReturnValue({ from: () => ({ select: () => chain }) });
    const { getActiveCredentials } = await import('./worker-passkey');
    await getActiveCredentials('w1');
    expect(eqCalls).toEqual([
      ['worker_id', 'w1'],
      ['status', 'active'],
    ]);
  });
});
