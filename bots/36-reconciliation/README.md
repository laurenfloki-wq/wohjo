# Bot 36 — Reconciliation

- **What it does:** daily three-way match across Stripe (money in), Xero
  (booked), and the product ledger. Any break is raised for a director; nothing
  is silently reconciled.
- **Trigger:** daily. **Runtime:** pg_cron -> Edge Function.
- **Gate tier:** T2 on break. **Model:** none (deterministic).
- **Expected monthly cost:** 0 AUD.

Evals: `reconciliation.eval.test.ts` — ties out cleanly; flags amount mismatch
and each missing side.
