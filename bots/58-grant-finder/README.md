# Bot 58 — Grant-finder

- **What it does:** weekly, scans grant sources (CBRIN/Bulletpoint/Radium etc.); a deterministic eligibility screen (jurisdiction + sector + open + amount) selects candidates; Sonnet drafts applications. Nothing is submitted without dual-control (T3).
- **Trigger:** weekly. **Runtime:** pg_cron -> Edge Function. **Gate:** T3 submission. **Model:** Haiku/Sonnet.
- **Expected monthly cost:** low.
  Evals: `grants.eval.test.ts` — eligibility screen, soonest-closing first.
