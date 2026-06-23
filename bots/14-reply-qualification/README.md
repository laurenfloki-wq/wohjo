# Bot 14 — Reply qualification

- **What it does:** classifies an inbound reply (interested / not-interested /
  out-of-office / unsubscribe / question) and routes it; unsubscribe takes
  precedence over interest signals. Drafts replies only for interested/question;
  reply is gated T2. Classification deterministic.
- **Trigger:** inbound-reply webhook. **Runtime:** Edge Function + pgmq.
- **Gate tier:** T2 reply. **Model:** Haiku/Sonnet.
- **Expected monthly cost:** low.

Evals: `reply.eval.test.ts` — routing, OOO requeue, unsubscribe precedence.
