# Bot 29 — Contract lifecycle

- **What it does:** daily, tracks expiries/renewals/notice windows and reminds. No expiry is missed — detection is a pure date comparison.
- **Trigger:** daily. **Runtime:** pg_cron -> Edge Function. **Gate:** T1. **Model:** none.
- **Expected monthly cost:** 0 AUD.
  Evals: `lifecycle.eval.test.ts` — expired/notice/expiring, urgency order.
