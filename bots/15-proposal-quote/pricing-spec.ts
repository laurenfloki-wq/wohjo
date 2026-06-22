// Pricing Spec v1.0 (placeholder values).
//
// The bot must price EXACTLY to the canonical Pricing Spec v1.0. The real
// dollar figures are a business artefact not present in this repo; the values
// here are documented placeholders with the correct SHAPE (tier base +
// per-active-worker), to be replaced with the signed Spec v1.0. See DECISIONS.md.
// Amounts are integer cents, GST-exclusive (GST added at quote time).

export type PricingTier = 'starter' | 'growth' | 'scale';

export interface TierRate {
  /** Monthly base in cents (ex-GST). */
  monthlyBaseCents: number;
  /** Per active worker per month in cents (ex-GST). */
  perActiveWorkerCents: number;
  /** Active workers included in the base before per-worker pricing applies. */
  includedWorkers: number;
}

export const PRICING_SPEC_V1: Record<PricingTier, TierRate> = {
  starter: { monthlyBaseCents: 29900, perActiveWorkerCents: 500, includedWorkers: 10 },
  growth: { monthlyBaseCents: 79900, perActiveWorkerCents: 400, includedWorkers: 50 },
  scale: { monthlyBaseCents: 199900, perActiveWorkerCents: 300, includedWorkers: 200 },
};
