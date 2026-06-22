import { describe, it, expect, vi } from 'vitest';
import { isEntitled, assertCompanyEntitled, EntitlementError } from './entitlement';

describe('isEntitled (D1 — grace on past_due)', () => {
  it('entitles active / trialing / past_due', () => {
    expect(isEntitled('active')).toBe(true);
    expect(isEntitled('trialing')).toBe(true);
    expect(isEntitled('past_due')).toBe(true); // grace window
  });
  it('blocks the terminal states', () => {
    expect(isEntitled('canceled')).toBe(false);
    expect(isEntitled('unpaid')).toBe(false);
    expect(isEntitled('incomplete_expired')).toBe(false);
    expect(isEntitled('paused')).toBe(false);
  });
  it('grandfathers null / empty / unknown (fail-open)', () => {
    expect(isEntitled(null)).toBe(true);
    expect(isEntitled(undefined)).toBe(true);
    expect(isEntitled('')).toBe(true);
    expect(isEntitled('incomplete')).toBe(true);
  });
});

// Minimal supabase stub: from().select().eq().maybeSingle()
const client = (result: { data: unknown; error: unknown }) =>
  ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve(result) }),
      }),
    }),
  }) as never;

describe('assertCompanyEntitled (D1)', () => {
  it('passes for an active company', async () => {
    await expect(
      assertCompanyEntitled(client({ data: { subscription_status: 'active' }, error: null }), 'c1'),
    ).resolves.toBeUndefined();
  });

  it('throws EntitlementError (402) for a canceled company', async () => {
    await expect(
      assertCompanyEntitled(
        client({ data: { subscription_status: 'canceled' }, error: null }),
        'c1',
      ),
    ).rejects.toMatchObject({
      name: 'EntitlementError',
      httpStatus: 402,
      subscriptionStatus: 'canceled',
    });
  });

  it('grandfathers a company with no subscription_status', async () => {
    await expect(
      assertCompanyEntitled(client({ data: { subscription_status: null }, error: null }), 'c1'),
    ).resolves.toBeUndefined();
  });

  it('fails OPEN on a lookup error (never blocks on a DB hiccup)', async () => {
    await expect(
      assertCompanyEntitled(client({ data: null, error: { message: 'db down' } }), 'c1'),
    ).resolves.toBeUndefined();
  });

  it('EntitlementError carries the offending status', () => {
    const e = new EntitlementError('unpaid');
    expect(e.httpStatus).toBe(402);
    expect(e.subscriptionStatus).toBe('unpaid');
  });
});
