# Bot 12 — Lead scoring

- **What it does:** deterministic, explainable lead score over ICP fit +
  engagement. Returns score, band (cold/warm/hot), and per-rule contributions
  so the "why" is always auditable.
- **Trigger:** contact-change webhook. **Runtime:** Edge Function.
- **Gate tier:** T0. **Model:** none.
- **Expected monthly cost:** 0 AUD.

Evals: `scoring.eval.test.ts` — hot ICP lead, cold clamp, no double-counted bands.
