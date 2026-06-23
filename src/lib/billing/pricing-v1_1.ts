// Pricing Specification v1.1 — bill engine + tier config.
//
// Two-part tariff: platform base + marginal per Active Verified Worker. All
// amounts are ex-GST (Decision C, Lauren 2026-06-23): the listed prices are the
// ex-GST cost a GST-registered labour-hire business compares on; GST (+10%) is
// added downstream by Stripe Tax, never baked into these constants.
//
// Director decisions locked 2026-06-23:
//   A — Growth→Enterprise at 120/121 is a SALES TRIGGER, not an auto-charge.
//       Crossing the Growth ceiling (120) flags for an Enterprise conversation;
//       computeMonthlyBillCents('enterprise', n) returns the LIST/indicative
//       figure (real Enterprise is negotiated per Order Form).
//   B — Starter floor confirmed: $99 incl. 10 workers, $5/worker 11–25.
//   C — ex-GST (above).
//   D — NO annual prepay. Monthly only; no yearly cadence/price exists.
//   E — billing unit = workers.is_active = true (roster). NOT verified-in-period.
//       Switching to verified-in-period later is a change to how `activeWorkers`
//       is counted at the call site (see BILL-4 countActive), not to this engine.
//
// SCOPE: this is the v1.1 source of truth for tier shape + bills. It is
// decoupled from the legacy flat-tier src/lib/stripe/pricing.ts during the
// transition; the cutover (checkout/webhooks/db enum/Stripe prices) lands once
// Stripe price objects exist (owner task). Worker COUNTS for billing/ceilings
// come from the caller (is_active count), not from here.

export type PlanTierV1_1 = 'starter' | 'growth' | 'enterprise';

interface MarginalBand {
  /** Inclusive upper worker index this band covers; null = unbounded. */
  upToWorker: number | null;
  centsPerWorker: number;
}

export interface TierConfigV1_1 {
  id: PlanTierV1_1;
  label: string;
  /** Platform base in ex-GST cents. Enterprise is a "from" floor (negotiated). */
  baseCents: number;
  /** Workers covered by the base (no marginal charge up to this count). */
  includedWorkers: number;
  /** Marginal per-worker bands above includedWorkers, in ascending order. */
  bands: readonly MarginalBand[];
  /** Max Active workers on this tier; null = unbounded (Enterprise). */
  ceiling: number | null;
  minTermMonths: number;
  /** One-off onboarding in ex-GST cents. Enterprise is a range → [min,max]. */
  onboardingCents: number | [number, number];
  /** Enterprise list bills are indicative; real terms are per Order Form. */
  negotiated: boolean;
  isPublic: boolean;
}

export const TIERS_V1_1: Readonly<Record<PlanTierV1_1, TierConfigV1_1>> = {
  starter: {
    id: 'starter',
    label: 'Starter',
    baseCents: 9_900,
    includedWorkers: 10,
    bands: [{ upToWorker: 25, centsPerWorker: 500 }],
    ceiling: 25,
    minTermMonths: 3,
    onboardingCents: 0,
    negotiated: false,
    isPublic: true,
  },
  growth: {
    id: 'growth',
    label: 'Growth',
    baseCents: 29_900,
    includedWorkers: 40,
    bands: [{ upToWorker: 120, centsPerWorker: 400 }],
    ceiling: 120,
    minTermMonths: 12,
    onboardingCents: 150_000,
    negotiated: false,
    isPublic: true,
  },
  enterprise: {
    id: 'enterprise',
    label: 'Enterprise',
    baseCents: 100_000, // "from $1,000" — negotiated floor
    includedWorkers: 0, // priced from worker 1
    bands: [
      { upToWorker: 400, centsPerWorker: 325 },
      { upToWorker: null, centsPerWorker: 300 }, // 401+
    ],
    ceiling: null,
    minTermMonths: 12,
    onboardingCents: [500_000, 1_500_000],
    negotiated: true,
    isPublic: true,
  },
};

/**
 * Indicative monthly bill in ex-GST cents for `activeWorkers` on `tier`.
 *
 * Workers beyond a tier's ceiling are NOT billed by that tier (they imply a tier
 * change), so the count is capped at the ceiling for Starter/Growth. Enterprise
 * is uncapped and banded ($3.25 to 400, $3.00 beyond); its result is a LIST
 * figure — real Enterprise pricing is negotiated (Decision A).
 *
 * GST is NOT included (Decision C) — add it downstream via Stripe Tax.
 */
export function computeMonthlyBillCents(tier: PlanTierV1_1, activeWorkers: number): number {
  const t = TIERS_V1_1[tier];
  const n = Math.max(0, Math.floor(activeWorkers));
  const capped = t.ceiling == null ? n : Math.min(n, t.ceiling);

  let cents = t.baseCents;
  let counted = t.includedWorkers; // already covered by base
  for (const band of t.bands) {
    if (counted >= capped) break;
    const bandUpTo = band.upToWorker == null ? capped : Math.min(capped, band.upToWorker);
    const workersInBand = Math.max(0, bandUpTo - counted);
    cents += workersInBand * band.centsPerWorker;
    counted = bandUpTo;
  }
  return cents;
}

/** Convenience: indicative monthly bill rounded to whole ex-GST dollars. */
export function monthlyBillDollars(tier: PlanTierV1_1, activeWorkers: number): number {
  return Math.round(computeMonthlyBillCents(tier, activeWorkers) / 100);
}

/**
 * Resolve the tier a worker count belongs in by ceiling (Decision A: crossing
 * 120 lands in Enterprise, which is sales-led — the caller flags rather than
 * auto-charges). Starter ≤25, Growth 26–120, Enterprise >120.
 */
export function resolveTierByWorkers(activeWorkers: number): PlanTierV1_1 {
  const n = Math.max(0, Math.floor(activeWorkers));
  if (n <= (TIERS_V1_1.starter.ceiling as number)) return 'starter';
  if (n <= (TIERS_V1_1.growth.ceiling as number)) return 'growth';
  return 'enterprise';
}
