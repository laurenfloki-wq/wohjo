# Bot 13 — CRM hygiene

- **What it does:** nightly, builds a reversible cleanup plan — duplicate
  contacts, hard-bounce suppressions, stale (180+ day) records. Returns a plan;
  it never mutates inline, so every action is auditable and reversible.
- **Trigger:** nightly. **Runtime:** pg_cron -> Edge Function.
- **Gate tier:** T0. **Model:** none.
- **Expected monthly cost:** 0 AUD.

Evals: `hygiene.eval.test.ts` — flags duplicates/bounces/stale; empty plan when clean.
