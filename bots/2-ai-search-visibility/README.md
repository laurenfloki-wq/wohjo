# Bot 2 — AI-search visibility

- **What it does:** weekly, queries target prompts across answer engines and
  scores brand presence (share of engines mentioning FLOSMOSIS/FLOSTRUCTION)
  with a week-over-week delta. Scoring/delta are deterministic; the LLM only
  judges presence in an answer.
- **Trigger:** weekly. **Runtime:** pg_cron -> Edge Function.
- **Gate tier:** T1. **Model:** Haiku/Sonnet (presence detection).
- **Expected monthly cost:** low.

Evals: `visibility.eval.test.ts` — presence share, delta, unseen-prompt baseline.
