// Bot 15 — Proposal/quote.
//
// Trigger: manual | Runtime: EF (HTTP) | Gate: T2 send | Model: Sonnet (cover
// note). Pricing must match Pricing Spec v1.0 EXACTLY: the calculation is pure
// and deterministic; the LLM only writes the cover note. Sending is gated T2.

import { PRICING_SPEC_V1, type PricingTier } from './pricing-spec';

export const BOT_ID = 'bot-15-proposal-quote';

const TIERS: PricingTier[] = ['starter', 'growth', 'scale'];

export interface QuoteLine {
  description: string;
  amountCents: number; // ex-GST
}

export interface Quote {
  tier: PricingTier;
  activeWorkers: number;
  lines: QuoteLine[];
  subtotalCents: number; // ex-GST
  gstCents: number;
  totalCents: number; // inc-GST
}

/**
 * Pure: build a quote strictly from Pricing Spec v1.0. Base + per-active-worker
 * for workers beyond the included count. GST (10%) added on the subtotal.
 */
export function buildQuote(tier: PricingTier, activeWorkers: number): Quote {
  if (activeWorkers < 0) throw new Error('activeWorkers must be non-negative');
  const rate = PRICING_SPEC_V1[tier];
  const billableWorkers = Math.max(0, activeWorkers - rate.includedWorkers);

  const lines: QuoteLine[] = [
    { description: `${tier} plan monthly base`, amountCents: rate.monthlyBaseCents },
  ];
  if (billableWorkers > 0) {
    lines.push({
      description: `${billableWorkers} active workers @ ${rate.perActiveWorkerCents}c`,
      amountCents: billableWorkers * rate.perActiveWorkerCents,
    });
  }

  const subtotalCents = lines.reduce((sum, l) => sum + l.amountCents, 0);
  // Subtotal is ex-GST; gross = subtotal * 1.1; GST = gross - subtotal.
  const totalCents = Math.round(subtotalCents * 1.1);
  const gstCents = totalCents - subtotalCents;
  return { tier, activeWorkers, lines, subtotalCents, gstCents, totalCents };
}

export interface TierRecommendation {
  recommended: PricingTier;
  quote: Quote;
  /** Every tier's monthly total (inc GST) at this worker count, cheapest first. */
  options: Array<{ tier: PricingTier; totalCents: number }>;
  /** Monthly saving vs the next-cheapest tier (cents). */
  savingVsNextCents: number;
  rationale: string;
}

/**
 * Consultative tier recommendation. Quoting Starter to a 150-worker firm (or
 * Scale to a 12-worker firm) loses deals and trust. We compute every tier's true
 * cost at the actual active-worker count and recommend the cheapest — then carry
 * the comparison so the proposal can show the customer they are on the right plan.
 */
export function recommendTier(activeWorkers: number): TierRecommendation {
  const options = TIERS.map((t) => ({
    tier: t,
    totalCents: buildQuote(t, activeWorkers).totalCents,
  })).sort((a, b) => a.totalCents - b.totalCents);
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
