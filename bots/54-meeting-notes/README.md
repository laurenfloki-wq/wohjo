# Bot 54 — Meeting notes

- **What it does:** Sonnet summarises a transcript; deterministic extraction pulls explicit action items (with @owners) and decisions, which are filed.
- **Trigger:** transcript upload/webhook. **Runtime:** Edge Function + pgmq. **Gate:** T1. **Model:** Sonnet.
- **Expected monthly cost:** low.
  Evals: `notes.eval.test.ts` — action extraction with owners, decision extraction.
