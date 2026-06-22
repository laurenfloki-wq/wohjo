// D1 — billing entitlement gate.
//
// A single chokepoint that gates NEW billable activity (starting a shift,
// approving, running a pay run) on the company's Stripe subscription state.
//
// Policy (Lauren, 2026-06-22 — "grace on past_due"):
//   active / trialing / past_due  → entitled
//   canceled / unpaid / incomplete_expired / paused → NOT entitled (read-only)
//   null / unknown / incomplete   → entitled (grandfathered / fail-open)
//
// Stripe keeps a subscription 'past_due' through its dunning retry window and
// only moves it to 'unpaid'/'canceled' once retries are exhausted, so treating
// past_due as entitled gives the grace period for free. null is grandfathered
// so legacy / pre-billing / test tenants are never locked out — enforcement
// applies once Stripe has set a real status.
//
// CRITICAL CARVE-OUT (audit BILL-5): this gate must NEVER be called on a path
// that reads or exports already-sealed WLES records, pay history, or worker
// record exports. A non-paying company AND its workers keep full access to
// their statutory records — only NEW billable activity is gated.

import type { SupabaseClient } from '@supabase/supabase-js';

const BLOCKED_STATUSES: ReadonlySet<string> = new Set([
  'canceled',
  'unpaid',
  'incomplete_expired',
  'paused',
]);

/**
 * Pure verdict. A blocked terminal status is NOT entitled; everything else
 * (active/trialing/past_due, null/grandfathered, or any unknown transitional
 * state) is entitled — fail-open by design so a transient/unknown state never
 * locks out real work.
 */
export function isEntitled(subscriptionStatus: string | null | undefined): boolean {
  if (subscriptionStatus == null || subscriptionStatus === '') return true;
  return !BLOCKED_STATUSES.has(subscriptionStatus);
}

/** Thrown by assertCompanyEntitled. Routes map this to HTTP 402. */
export class EntitlementError extends Error {
  readonly httpStatus = 402;
  constructor(public readonly subscriptionStatus: string | null) {
    super('This action needs an active subscription. Your sealed records and pay history remain available.');
    this.name = 'EntitlementError';
  }
}

/**
 * Gate a new-billable-activity mutation. Throws EntitlementError (→ 402) if the
 * company's subscription is in a blocked terminal state. Fails OPEN on a lookup
 * error — never block real work because the billing read hiccuped.
 */
export async function assertCompanyEntitled(
  supabase: SupabaseClient,
  companyId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('companies')
    .select('subscription_status')
    .eq('id', companyId)
    .maybeSingle();
  if (error) return; // fail-open on read error
  const status = (data as { subscription_status: string | null } | null)?.subscription_status ?? null;
  if (!isEntitled(status)) throw new EntitlementError(status);
}
