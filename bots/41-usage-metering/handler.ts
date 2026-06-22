// Bot 41 — Usage-metering integrity.
//
// Trigger: pre-billing | Runtime: pg_cron->EF | Gate: T2 on mismatch | Model: none.
//
// Verifies active-worker counts (the metered unit) against what Stripe will
// bill. Deterministic: any divergence is flagged for a director (T2), never
// silently reconciled. Billing must never diverge from metered usage unflagged.

export const BOT_ID = 'bot-41-usage-metering';

export interface MeteringRow {
  tenantId: string;
  meteredActiveWorkers: number;
  billedActiveWorkers: number;
}

export interface MeteringFlag {
  tenantId: string;
  meteredActiveWorkers: number;
  billedActiveWorkers: number;
  delta: number;
}

/**
 * Pure: return one flag per tenant where metered != billed. Empty result means
 * billing ties out exactly. Sorted by absolute delta descending so the largest
 * divergence surfaces first.
 */
export function findMismatches(rows: ReadonlyArray<MeteringRow>): MeteringFlag[] {
  return rows
    .filter((r) => r.meteredActiveWorkers !== r.billedActiveWorkers)
    .map((r) => ({
      tenantId: r.tenantId,
      meteredActiveWorkers: r.meteredActiveWorkers,
      billedActiveWorkers: r.billedActiveWorkers,
      delta: r.meteredActiveWorkers - r.billedActiveWorkers,
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
