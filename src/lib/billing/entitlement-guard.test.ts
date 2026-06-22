import { describe, it, expect, vi, beforeEach } from 'vitest';

const { assertMock } = vi.hoisted(() => ({ assertMock: vi.fn() }));
vi.mock('./entitlement', async (importActual) => {
  const actual = await importActual<typeof import('./entitlement')>();
  return { ...actual, assertCompanyEntitledBySystem: assertMock };
});

import { entitlementGuard } from './entitlement-guard';
import { EntitlementError } from './entitlement';

beforeEach(() => vi.clearAllMocks());

describe('entitlementGuard (D1)', () => {
  it('returns null (no block) when the company is entitled', async () => {
    assertMock.mockResolvedValueOnce(undefined);
    expect(await entitlementGuard('c1')).toBeNull();
  });

  it('returns a 402 SUBSCRIPTION_REQUIRED when blocked', async () => {
    assertMock.mockRejectedValueOnce(new EntitlementError('canceled'));
    const res = await entitlementGuard('c1');
    expect(res?.status).toBe(402);
    const body = (await res!.json()) as { code: string; subscription_status: string | null };
    expect(body.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(body.subscription_status).toBe('canceled');
  });

  it('rethrows non-entitlement errors (does not swallow real bugs)', async () => {
    assertMock.mockRejectedValueOnce(new Error('boom'));
    await expect(entitlementGuard('c1')).rejects.toThrow('boom');
  });
});
