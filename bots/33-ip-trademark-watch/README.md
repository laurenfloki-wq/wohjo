# Bot 33 — IP & trademark watch

- **What it does:** weekly, screens register hits against our watched marks (FLOSMOSIS/FLOSTRUCTION/WLES) with a deterministic bigram-similarity measure; flags relevant hits with the source. Haiku triages borderline cases.
- **Trigger:** weekly. **Runtime:** pg_cron -> Edge Function. **Gate:** T1. **Model:** Haiku (triage).
- **Expected monthly cost:** ~0 AUD.
  Evals: `ip.eval.test.ts` — identical/dissimilar scores, near-identical flagged with source.
