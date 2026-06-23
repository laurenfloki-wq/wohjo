# Bot 5 — Social engagement

- **What it does:** classifies inbound comments (question/complaint/praise/spam)
  and drafts replies for questions and complaints. Replies are queued, never
  auto-sent (T2). Triage is deterministic; the LLM refines and drafts.
- **Trigger:** poll/webhook. **Runtime:** Edge Function + pgmq.
- **Gate tier:** T2 reply. **Model:** Haiku/Sonnet.
- **Expected monthly cost:** low.

Evals: `engagement.eval.test.ts` — intent classification, draft-only for Q/complaint, never spam.
