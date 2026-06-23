# Bot 38 — BAS/GST prep

- **What it does:** assembles BAS-ready figures (G1 total sales, 1A GST on
  sales, 1B GST on purchases, 7 net GST) from period transactions. Ties to Xero.
- **Trigger:** BAS-period. **Runtime:** pg_cron -> Edge Function.
- **Gate tier:** T2 lodge (nothing lodged without a director). **Model:** none.
- **Expected monthly cost:** 0 AUD.

Evals: `bas.eval.test.ts` — correct figures; GST-free supplies excluded from 1A.
