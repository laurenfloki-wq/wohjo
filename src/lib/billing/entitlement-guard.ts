// D1 — route guard for new billable activity.
//
// One-liner for mutation routes:  const gate = await entitlementGuard(companyId); if (gate) return gate;
// Returns a 402 NextResponse when the company isn't entitled, otherwise null.
// MUST NOT be used on carve-out routes (reading/exporting sealed records, pay
// history, worker exports) — those stay open to non-paying tenants by law.

import { NextResponse } from 'next/server';
import { assertCompanyEntitledBySystem, EntitlementError } from './entitlement';

export async function entitlementGuard(companyId: string): Promise<NextResponse | null> {
  try {
    await assertCompanyEntitledBySystem(companyId);
    return null;
  } catch (e) {
    if (e instanceof EntitlementError) {
      return NextResponse.json(
        {
          ok: false,
          code: 'SUBSCRIPTION_REQUIRED',
          error: e.message,
          subscription_status: e.subscriptionStatus,
        },
        { status: 402 },
      );
    }
    throw e;
  }
}
