// Bot 41 — Usage-metering integrity (FLOSMOSIS-calibrated).
//
// Trigger: pre-billing | Runtime: pg_cron->EF | Gate: T2 on mismatch | Model: none.
//
// Verifies active-worker counts (the metered unit) against what Stripe will bill.
// Direction matters for cash and trust:
//   - UNDER-billed (metered > billed): silent revenue leakage — we are giving
//     seats away. The biggest one is usually the biggest unflagged loss.
//   - OVER-billed (billed > metered): the customer is overcharged — a refund and
//     a trust risk; fix down, consider a credit.
// Dollar impact is estimated from the per-active-worker rate when supplied.
// Deterministic; every divergence is flagged for a director (T2), never silently
// reconciled.

export const BOT_ID = 'bot-41-usage-metering';

export interface MeteringRow {
  tenantId: string;
  meteredActiveWorkers: number;
  billedActiveWorkers: number;
  /** Per-active-worker price (ex-GST cents) for this tenant's tier, for impact. */
  perWorkerCents?: number;
}

export type MeteringDirection = 'under_billed' | 'over_billed';

export interface MeteringFlag {
  tenantId: string;
  direction: MeteringDirection;
  meteredActiveWorkers: number;
  billedActiveWorkers: number;
  delta: number; // metered - billed (signed)
  /** Estimated monthly $ impact (ex-GST cents); 0 when no rate supplied. */
  revenueImpactCents: number;
}

/**
 * Pure: one flag per tenant where metered != billed, classified by direction and
 * sized by revenue impact. Sorted by impact (then absolute headcount delta) so
 * the largest cash exposure surfaces first. Empty result = billing ties out.
 */
export function findMismatches(rows: ReadonlyArray<MeteringRow>): MeteringFlag[] {
  return rows
    .filter((r) => r.meteredActiveWorkers !== r.billedActiveWorkers)
    .map((r) => {
      const delta = r.meteredActiveWorkers - r.billedActiveWorkers;
      const rate = r.perWorkerCents ?? 0;
      return {
        tenantId: r.tenantId,
        direction: delta > 0 ? ('under_billed' as const) : ('over_billed' as const),
        meteredActiveWorkers: r.meteredActiveWorkers,
        billedActiveWorkers: r.billedActiveWorkers,
        delta,
        revenueImpactCents: Math.abs(delta) * rate,
      };
    })
    .sort(
      (a, b) =>
        b.revenueImpactCents - a.revenueImpactCents || Math.abs(b.delta) - Math.abs(a.delta),
    );
}

/** Total monthly revenue currently leaking (under-billed, ex-GST cents). */
export function totalLeakageCents(flags: ReadonlyArray<MeteringFlag>): number {
  return flags
    .filter((f) => f.direction === 'under_billed')
    .reduce((sum, f) => sum + f.revenueImpactCents, 0);
}
