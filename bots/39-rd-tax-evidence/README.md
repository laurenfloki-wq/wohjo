# Bot 39 — R&D tax evidence

- **What it does:** weekly, tags eligible engineering spend for the RDTI and
  links it to commit evidence. Eligibility is deterministic (eligible category
  AND commit evidence present); sums are exact. Haiku only categorises genuinely
  ambiguous items.
- **Trigger:** weekly. **Runtime:** pg_cron -> Edge Function.
- **Gate tier:** T1. **Model:** Haiku (edge categorisation only).
- **Expected monthly cost:** ~0 AUD.

Evals: `rd.eval.test.ts` — eligible tagged + summed; no-evidence excluded.
