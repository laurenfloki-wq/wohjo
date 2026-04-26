// FLOSTRUCTION pricing tier configuration.
// Single source of truth for: tier bracket rules, Stripe product
// IDs, pricing-page display, contract template parameters, and
// the nightly tier-recheck cron.
//
// Pricing model — Option C (hybrid), per founder-confirmed
// pricing-tier-brackets-2026-04-25.md (Bulletproofing sprint P3).
//
// Rule: customer's tier = MAX(tier_by_worker_count, tier_by_shift_volume).
// Founding cohort is exempt from auto-upgrade for the 3-year price-lock
// window per founding-v1 contract template §3(b).

export type PricingTier = 'founding' | 'standard' | 'growth' | 'scale' | 'enterprise';
export type BillingCadence = 'monthly' | 'yearly';

export interface TierBracket {
  /** Stable identifier used in `companies.pricing_tier` enum */
  id: PricingTier;
  /** Customer-facing display label */
  label: string;
  /** Monthly price in AUD cents (Stripe stores cents) */
  monthly_aud_cents: number;
  /** Yearly price in AUD cents — 10% discount applied. NULL if not offered (Founding, Enterprise). */
  yearly_aud_cents: number | null;
  /**
   * Tier bracket — upper bounds (inclusive). A customer's tier is
   * the LOWEST tier such that BOTH max_workers AND max_shifts_30d are
   * NOT exceeded. If max_workers is null or max_shifts_30d is null,
   * the tier is unbounded on that axis.
   */
  max_workers: number | null;
  max_shifts_30d: number | null;
  /** Stripe lookup_key — used for stable price lookup across env keys */
  stripe_lookup_monthly: string;
  stripe_lookup_yearly: string | null;
  /** Whether to display this tier on the public pricing page */
  is_public: boolean;
  /** Whether this tier is auto-assignable. Founding/Enterprise are not. */
  is_auto_assignable: boolean;
}

/**
 * Tier brackets — Option C (hybrid). Order matters: tier-resolution
 * walks Standard → Growth → Scale → Enterprise looking for the lowest
 * tier that contains the customer.
 *
 * Founding is computed separately (cohort position 1..20 only,
 * exempt from auto-upgrade for 3 years).
 */
export const TIERS: readonly TierBracket[] = [
  {
    id: 'founding',
    label: 'Founding Cohort',
    monthly_aud_cents: 39900,                  // A$399.00
    yearly_aud_cents: null,                    // Founding has no annual prepay during lock
    max_workers: null,                         // unlimited within lock
    max_shifts_30d: null,
    stripe_lookup_monthly: 'founding-monthly',
    stripe_lookup_yearly: null,
    is_public: false,                          // hidden after the 20-customer cap
    is_auto_assignable: false,                 // assigned only via founding-cohort allocator
  },
  {
    id: 'standard',
    label: 'Standard',
    monthly_aud_cents: 49900,                  // A$499.00
    yearly_aud_cents: 538920,                  // A$5,389.20 (499 × 12 × 0.9)
    max_workers: 25,
    max_shifts_30d: 500,
    stripe_lookup_monthly: 'standard-monthly',
    stripe_lookup_yearly: 'standard-yearly',
    is_public: true,
    is_auto_assignable: true,
  },
  {
    id: 'growth',
    label: 'Growth',
    monthly_aud_cents: 99900,                  // A$999.00
    yearly_aud_cents: 1078920,                 // A$10,789.20
    max_workers: 75,
    max_shifts_30d: 2000,
    stripe_lookup_monthly: 'growth-monthly',
    stripe_lookup_yearly: 'growth-yearly',
    is_public: true,
    is_auto_assignable: true,
  },
  {
    id: 'scale',
    label: 'Scale',
    monthly_aud_cents: 199900,                 // A$1,999.00
    yearly_aud_cents: 2158920,                 // A$21,589.20
    max_workers: 200,
    max_shifts_30d: 5000,
    stripe_lookup_monthly: 'scale-monthly',
    stripe_lookup_yearly: 'scale-yearly',
    is_public: true,
    is_auto_assignable: true,
  },
  {
    id: 'enterprise',
    label: 'Enterprise',
    monthly_aud_cents: 0,                      // bespoke; no Stripe price object
    yearly_aud_cents: null,
    max_workers: null,                         // anything above scale
    max_shifts_30d: null,
    stripe_lookup_monthly: 'enterprise-monthly',
    stripe_lookup_yearly: null,
    is_public: true,
    is_auto_assignable: false,                 // sales-led
  },
] as const;

/** Look up a tier by id; throws if unknown. */
export function tierById(id: PricingTier): TierBracket {
  const t = TIERS.find((t) => t.id === id);
  if (!t) throw new Error(`Unknown pricing tier: ${id}`);
  return t;
}

/**
 * Resolve a customer's tier from their CURRENT live counts. Implements
 * the Option C MAX rule: customer pays the higher of worker-count tier
 * and shift-volume tier.
 *
 * Founding-cohort customers are NOT routed through this function — they
 * are assigned 'founding' at signup and exempt for the 3-year lock.
 *
 * Enterprise tier is returned when both inputs exceed Scale.
 */
export function resolveTierFromUsage(input: {
  active_worker_count: number;
  sealed_shifts_last_30d: number;
}): PricingTier {
  const { active_worker_count, sealed_shifts_last_30d } = input;
  // Standard, Growth, Scale brackets ordered ascending. Find the LOWEST
  // tier where neither cap is exceeded.
  const autoTiers = TIERS.filter((t) => t.is_auto_assignable);
  for (const t of autoTiers) {
    const workerOk = t.max_workers === null || active_worker_count <= t.max_workers;
    const shiftOk  = t.max_shifts_30d === null || sealed_shifts_last_30d <= t.max_shifts_30d;
    if (workerOk && shiftOk) return t.id;
  }
  // Exceeded all auto-assignable tiers → Enterprise (sales-led).
  return 'enterprise';
}

/**
 * Heads-up alert threshold: 80% of Scale on either axis triggers an
 * "Enterprise prospect" notification per founder direction.
 */
export const ENTERPRISE_HEADSUP_WORKER_THRESHOLD = Math.floor(
  (tierById('scale').max_workers as number) * 0.8,
);
export const ENTERPRISE_HEADSUP_SHIFT_THRESHOLD = Math.floor(
  (tierById('scale').max_shifts_30d as number) * 0.8,
);

/**
 * Founding cohort allocation cap.
 */
export const FOUNDING_COHORT_CAP = 20;

/**
 * Founding price-lock duration in days from signup_completed_at.
 * 3 years exact = 36 months ≈ 1095 days; we use 1095 for simplicity.
 */
export const FOUNDING_PRICE_LOCK_DAYS = 1095;
