# Bot 21 — Churn-risk

- **What it does:** daily, computes an explainable churn-risk score from usage
  signals (days since last seal, active-worker trend, failed payments, open
  tickets) and ranks tenants. Haiku writes the risk narrative over the ranked list.
- **Trigger:** daily. **Runtime:** pg_cron -> Edge Function.
- **Gate tier:** T1. **Model:** Haiku (summarise).
- **Expected monthly cost:** ~0 AUD.

Evals: `churn.eval.test.ts` — healthy low, high with reasons, ranking.
