# Bot 52 — Daily brief

- **What it does:** assembles money/pipeline/CI/pending-gates into one brief each morning; Haiku writes the narrative over figures that tie to source. Flags attention on red CI or pending gates.
- **Trigger:** morning. **Runtime:** pg_cron -> Edge Function. **Gate:** T1. **Model:** Haiku.
- **Expected monthly cost:** ~0 AUD.
  Evals: `brief.eval.test.ts` — section assembly, attention flag.
