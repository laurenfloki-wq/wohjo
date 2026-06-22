# Bot 24 — Knowledge base

- **What it does:** on a resolved ticket, Sonnet drafts a KB article; the
  deterministic chunker splits it for embedding into bot_kb_chunks (pgvector),
  so support (bot 23) can retrieve it. Chunking is stable for consistent embeddings.
- **Trigger:** resolved-ticket event. **Runtime:** Edge Function + pgmq.
- **Gate tier:** T1. **Model:** Sonnet (draft article).
- **Expected monthly cost:** low.

Evals: `kb.eval.test.ts` — single chunk, paragraph split, oversized hard-split.
