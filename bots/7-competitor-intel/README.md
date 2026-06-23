# Bot 7 — Competitor & market intel

- **What it does:** weekly, gathers from search + regulator feeds, dedupes by
  normalised URL (keeping the most recent), drops stale sources, then briefs
  over distinct recent sources. Curation is deterministic; the LLM extracts + briefs.
- **Trigger:** weekly. **Runtime:** pg_cron -> Edge Function.
- **Gate tier:** T1. **Model:** Haiku/Sonnet.
- **Expected monthly cost:** low.

Evals: `intel.eval.test.ts` — URL normalisation, dedupe newest-first, recency filter.
