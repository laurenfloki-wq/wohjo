# Bot 27 — Contract drafting

- **What it does:** drafts from canonical templates only; Sonnet tailors within the template; any missing canonical clause or non-standard clause is flagged and forces escalation. Execution is dual-control (T3).
- **Trigger:** manual. **Runtime:** Edge Function (HTTP). **Gate:** T3 execution. **Model:** Sonnet (tailor).
- **Expected monthly cost:** low.
  Evals: `drafting.eval.test.ts` — complete template, missing clause, non-standard clause.
