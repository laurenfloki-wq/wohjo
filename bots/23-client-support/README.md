# Bot 23 — 24/7 client support

- **What it does:** retrieves from the pgvector KB and answers in voice, grounded
  in retrieved sources. Escalates billing/legal topics and low-confidence
  retrievals to a director (T2); answers general, well-grounded queries at T0.
  Never answers ungrounded.
- **Trigger:** chat/email/webhook. **Runtime:** Edge Function (HTTP).
- **Gate tier:** T0 grounded, T2 billing/legal. **Model:** Sonnet (Haiku route).
- **Expected monthly cost:** token-heaviest bot; prompt caching on KB context.

Evals: `support.eval.test.ts` — answer vs escalate, grounding guard.
