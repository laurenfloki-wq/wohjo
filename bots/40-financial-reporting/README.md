# Bot 40 — Financial reporting

- **What it does:** monthly P&L, cash, and runway. Figures are computed
  deterministically and tie to source; the Haiku narrative only describes those
  numbers, never invents them.
- **Trigger:** monthly. **Runtime:** pg_cron -> Edge Function.
- **Gate tier:** T1. **Model:** Haiku (narrative only).
- **Expected monthly cost:** ~0 AUD (one short Haiku call per month).

Evals: `reporting.eval.test.ts` — gross/net profit, burn, runway; null runway
when profitable.
