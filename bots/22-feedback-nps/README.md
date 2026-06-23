# Bot 22 — Feedback/NPS

- **What it does:** runs lifecycle surveys and computes NPS deterministically
  (promoters 9-10, passives 7-8, detractors 0-6; NPS = %prom - %detr). Haiku
  synthesises themes with verbatim evidence. Survey sends gated T2.
- **Trigger:** lifecycle. **Runtime:** pg_cron -> Edge Function.
- **Gate tier:** T2 send. **Model:** Haiku (theme synthesis).
- **Expected monthly cost:** ~0 AUD.

Evals: `nps.eval.test.ts` — classification, NPS formula, empty set.
