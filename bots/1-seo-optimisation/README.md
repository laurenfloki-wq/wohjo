# Bot 1 — SEO & content optimisation

- **What it does:** weekly crawl + deterministic SEO audit (missing/long title,
  meta description, h1 count, thin content), prioritised highest-severity first.
  Haiku/Sonnet propose fixes and content briefs over the audit; publishing is gated T2.
- **Trigger:** weekly. **Runtime:** pg_cron -> Edge Function.
- **Gate tier:** T1 report, T2 publish. **Model:** Haiku/Sonnet (fixes + briefs).
- **Expected monthly cost:** low.

Evals: `seo.eval.test.ts` — healthy page clean; missing title/h1 high; thin/long meta; priority order.
