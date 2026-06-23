# Bot 11 — ICP list-building

- **What it does:** weekly, pulls VIC/QLD/ACT (etc.) labour-hire licensing
  registers, diffs against known licence numbers, and adds only new licensees
  (tagged). Idempotent by construction — re-running adds nothing already known.
- **Trigger:** weekly. **Runtime:** pg_cron -> Edge Function.
- **Gate tier:** T1. **Model:** Haiku (tag new licensees only).
- **Expected monthly cost:** ~0 AUD.

Evals: `icp.eval.test.ts` — only-new diff, idempotent re-run, intra-pull dedupe.
