# Bot 47 — Uptime/SLO watchdog

- **What it does:** watches the error budget over a window, pages on sustained
  burn (>= 2x), and recommends rollback on fast burn (>= 10x). Burn-rate maths
  is pure and deterministic; the external uptime monitor + pg_cron feed it.
- **Trigger:** continuous + scheduled checks. **Runtime:** external uptime
  monitor + pg_cron -> Edge Function.
- **Gate tier:** T1. **Model:** none.
- **Expected monthly cost:** 0 AUD.

Evals: `slo.eval.test.ts` — within-budget, page threshold, rollback threshold,
empty-window safety.
