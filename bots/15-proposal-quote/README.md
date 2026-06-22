# Bot 15 — Proposal/quote

- **What it does:** builds a quote that matches Pricing Spec v1.0 exactly (tier
  base + per-active-worker beyond the included count), adds 10% GST, and Sonnet
  writes the cover note. Sending is gated T2.
- **Trigger:** manual. **Runtime:** Edge Function (HTTP).
- **Gate tier:** T2 send. **Model:** Sonnet (cover note only).
- **Expected monthly cost:** low.

Note: `pricing-spec.ts` carries documented PLACEHOLDER figures with the correct
shape, pending the signed Pricing Spec v1.0 (see DECISIONS.md).
Evals: `quote.eval.test.ts` — base-only, per-worker overage, exact GST, input guard.
