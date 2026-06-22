// Pricing Spec v1.0 — FLOSMOSIS PTY LTD canonical pricing.
//
// The bot must price EXACTLY to this signed spec. Three tiers, metered on active
// workers (the value unit). Starter and Growth charge a monthly base covering an
// included worker allowance, then a flat per-worker rate on the workers above it,
// up to a hard ceiling — past the ceiling the account moves to the next tier.
// Enterprise is priced from the first worker on marginal per-worker bands with no
// ceiling.
//
// All amounts are integer cents, GST-EXCLUSIVE. The monthly recurring figures
// here are the ex-GST subtotal; 10% GST is added at quote time (buildQuote).
// Onboarding fees and minimum terms are contractual and carried for the proposal;
// they are not part of the monthly recurring subtotal.

export type PricingTier = 'starter' | 'growth' | 'enterprise';

/** A marginal per-worker rate band, applied to workers above includedWorkers. */
export interface TierBand {
  /** Absolute upper worker bound this rate applies to (inclusive); null = unbounded. */
  uptoWorkers: number | null;
  /** Per active worker per month, in cents (ex-GST). */
  perWorkerCents: number;
}

export interface TierRate {
  /** Monthly base in cents (ex-GST). */
  monthlyBaseCents: number;
  /** Active workers covered by the base before per-worker pricing applies.
   *  Enterprise = 0 (priced from the first worker). */
  includedWorkers: number;
  /** Marginal per-worker bands for workers beyond includedWorkers, in order. */
  bands: TierBand[];
  /** Maximum active workers the tier supports; null = unbounded (Enterprise).
   *  Beyond the ceiling the account moves to the next tier. */
  maxWorkers: number | null;
  /** One-off onboarding/implementation fee range (ex-GST cents). */
  onboardingMinCents: number;
  onboardingMaxCents: number;
  /** Minimum contract term in months. */
  minTermMonths: number;
}

export const PRICING_SPEC_V1: Record<PricingTier, TierRate> = {
  // AUD 99 base / 10 included / AUD 5 per worker 11–25 / ceiling 25 / no onboarding / 3-month min.
  starter: {
    monthlyBaseCents: 9900,
    includedWorkers: 10,
    bands: [{ uptoWorkers: 25, perWorkerCents: 500 }],
    maxWorkers: 25,
    onboardingMinCents: 0,
    onboardingMaxCents: 0,
    minTermMonths: 3,
  },
  // AUD 299 base / 40 included / AUD 4 per worker 41–120 / ceiling 120 / AUD 1,500 onboarding / 12-month min.
  growth: {
    monthlyBaseCents: 29900,
    includedWorkers: 40,
    bands: [{ uptoWorkers: 120, perWorkerCents: 400 }],
    maxWorkers: 120,
    onboardingMinCents: 150000,
    onboardingMaxCents: 150000,
    minTermMonths: 12,
  },
  // From AUD 1,000 base / priced from worker 1 / AUD 3.25 (workers 1–400), AUD 3.00 (401+) marginal /
  // no ceiling / AUD 5,000–15,000 onboarding / 12-month min.
  enterprise: {
    monthlyBaseCents: 100000,
    includedWorkers: 0,
    bands: [
      { uptoWorkers: 400, perWorkerCents: 325 },
      { uptoWorkers: null, perWorkerCents: 300 },
    ],
    maxWorkers: null,
    onboardingMinCents: 500000,
    onboardingMaxCents: 1500000,
    minTermMonths: 12,
  },
};

/** Tiers in ascending size order. */
export const PRICING_TIERS: PricingTier[] = ['starter', 'growth', 'enterprise'];
