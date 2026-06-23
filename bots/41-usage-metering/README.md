# Bot 41 — Usage-metering integrity

- **What it does:** before billing, verifies metered active-worker counts
  against what Stripe will bill. Any divergence is flagged for a director;
  nothing is silently reconciled. Billing never diverges from usage unflagged.
- **Trigger:** pre-billing.
- **Runtime:** pg_cron -> Edge Function.
- **Gate tier:** T2 on mismatch (single-director approval before billing proceeds).
- **Model:** none (deterministic).
- **Expected monthly cost:** 0 AUD.

Evals: `metering.eval.test.ts` — ties out cleanly; flags divergence largest-first.
