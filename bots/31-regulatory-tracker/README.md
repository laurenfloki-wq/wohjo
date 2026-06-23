# Bot 31 — Regulatory submission tracker

- **What it does:** tracks SWA/state/ATO/FWO submissions, reminds on due dates, parses responses (Haiku). Due/overdue detection deterministic; nothing filed without dual-control (T3).
- **Trigger:** cron + inbound email. **Runtime:** pg_cron->EF + EF (email). **Gate:** T1 internal, T3 filing. **Model:** Haiku.
- **Expected monthly cost:** ~0 AUD.
  Evals: `tracker.eval.test.ts` — overdue/due-soon, accepted not chased.
