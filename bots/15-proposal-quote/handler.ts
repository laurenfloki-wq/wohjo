// Bot 15 — Proposal/quote.
//
// Trigger: manual | Runtime: EF (HTTP) | Gate: T2 send | Model: Sonnet (cover
// note). Pricing must match Pricing Spec v1.0 EXACTLY: the calculation is pure
// and deterministic; the LLM only writes the cover note. Sending is gated T2.

import { PRICING_SPEC_V1, PRICING_TIERS, type PricingTier, type TierRate } from './pricing-spec';

export const BOT_ID = 'bot-15-proposal-quote';

export interface QuoteLine {
  description: string;
  amountCents: number; // ex-GST
}

export interface Quote {
  tier: PricingTier;
  activeWorkers: number;
  lines: QuoteLine[];
  subtotalCents: number; // monthly recurring, ex-GST
  gstCents: number;
  totalCents: number; // monthly recurring, inc-GST
  // Contractual terms carried for the proposal (not part of the monthly subtotal).
  onboardingMinCents: number;
  onboardingMaxCents: number;
  minTermMonths: number;
}

/**
 * Pure: marginal per-worker charge for the workers above the included allowance,
 * walking the tier's rate bands. For Enterprise (includedWorkers = 0) this prices
 * from the first worker. Returns the charge and the billable worker count.
 */
function bandedWorkerCents(
  rate: TierRate,
  activeWorkers: number,
): { cents: number; billable: number } {
  let cents = 0;
  let billable = 0;
  let prevUpto = 0;
  for (const band of rate.bands) {
    const upto = band.uptoWorkers ?? activeWorkers;
    const low = Math.max(prevUpto, rate.includedWorkers);
    const high = Math.min(upto, activeWorkers);
    const n = Math.max(0, high - low);
    cents += n * band.perWorkerCents;
    billable += n;
    prevUpto = upto;
    if (activeWorkers <= upto) break;
  }
  return { cents, billable };
}

/**
 * Pure: build a monthly quote strictly from Pricing Spec v1.0. The base covers
 * the included workers; workers above are charged on the tier's marginal bands,
 * up to the tier ceiling. GST (10%) is added on the monthly subtotal. Throws when
 * the worker count is negative or exceeds the tier's ceiling — use recommendTier
 * to pick the eligible tier (the ceiling is the move-up point, e.g. Decision A:
 * past Growth's 120 the account moves to Enterprise, priced from worker 1).
 */
export function buildQuote(tier: PricingTier, activeWorkers: number): Quote {
  if (!Number.isInteger(activeWorkers) || activeWorkers < 0)
    throw new Error('activeWorkers must be a non-negative integer');
  const rate = PRICING_SPEC_V1[tier];
  if (rate.maxWorkers != null && activeWorkers > rate.maxWorkers)
    throw new Error(
      `${tier} supports up to ${rate.maxWorkers} active workers (got ${activeWorkers})`,
    );

  const { cents: workerCents, billable } = bandedWorkerCents(rate, activeWorkers);
  const lines: QuoteLine[] = [
    { description: `${tier} plan monthly base`, amountCents: rate.monthlyBaseCents },
  ];
  if (workerCents > 0) {
    lines.push({
      description:
        rate.includedWorkers > 0
          ? `${billable} active workers beyond ${rate.includedWorkers} included`
          : `${billable} active workers (priced from worker 1)`,
      amountCents: workerCents,
    });
  }

  const subtotalCents = lines.reduce((sum, l) => sum + l.amountCents, 0);
  // Subtotal is ex-GST; gross = subtotal * 1.1; GST = gross - subtotal.
  const totalCents = Math.round(subtotalCents * 1.1);
  const gstCents = totalCents - subtotalCents;
  return {
    tier,
    activeWorkers,
    lines,
    subtotalCents,
    gstCents,
    totalCents,
    onboardingMinCents: rate.onboardingMinCents,
    onboardingMaxCents: rate.onboardingMaxCents,
    minTermMonths: rate.minTermMonths,
  };
}

/** Pure: tiers whose ceiling can serve this active-worker count. */
export function eligibleTiers(activeWorkers: number): PricingTier[] {
  return PRICING_TIERS.filter((t) => {
    const max = PRICING_SPEC_V1[t].maxWorkers;
    return max == null || activeWorkers <= max;
  });
}

export interface TierRecommendation {
  recommended: PricingTier;
  quote: Quote;
  /** Each eligible tier's monthly total (inc GST) at this worker count, cheapest first. */
  options: Array<{ tier: PricingTier; totalCents: number }>;
  /** Monthly saving vs the next-cheapest eligible tier (cents). */
  savingVsNextCents: number;
  rationale: string;
}

/**
 * Consultative tier recommendation. Quoting Starter to a 150-worker firm (or
 * Enterprise to a 12-worker firm) loses deals and trust. We compute every
 * ELIGIBLE tier's true cost at the actual active-worker count and recommend the
 * cheapest — then carry the comparison so the proposal can show the customer they
 * are on the right plan. Tier ceilings handle the move-up automatically (a firm
 * past Growth's 120 only sees Enterprise).
 */
export function recommendTier(activeWorkers: number): TierRecommendation {
  const options = eligibleTiers(activeWorkers)
    .map((t) => ({ tier: t, totalCents: buildQuote(t, activeWorkers).totalCents }))
    .sort((a, b) => a.totalCents - b.totalCents);
  const recommended = options[0]!.tier;
  const savingVsNextCents =
    options.length > 1 ? options[1]!.totalCents - options[0]!.totalCents : 0;
  const rationale =
    savingVsNextCents > 0
      ? `${recommended} is the best value at ${activeWorkers} active workers, ${(savingVsNextCents / 100).toFixed(2)} AUD/mo cheaper than the next plan.`
      : `${recommended} fits ${activeWorkers} active workers.`;
  return {
    recommended,
    quote: buildQuote(recommended, activeWorkers),
    options,
    savingVsNextCents,
    rationale,
  };
}
