// Bot 15 — Proposal/quote.
//
// Trigger: manual | Runtime: EF (HTTP) | Gate: T2 send | Model: Sonnet (cover
// note). Pricing must match Pricing Spec v1.0 EXACTLY: the calculation is pure
// and deterministic; the LLM only writes the cover note. Sending is gated T2.

import { PRICING_SPEC_V1, type PricingTier } from './pricing-spec';

export const BOT_ID = 'bot-15-proposal-quote';

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
