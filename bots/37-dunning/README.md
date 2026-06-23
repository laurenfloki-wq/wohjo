# Bot 37 — Dunning

- **What it does:** on a failed payment, walks a deterministic retry ladder
  (gentle reminder, firmer follow-up, final notice + SMS) then escalates to a
  human — never dunning indefinitely. Sonnet drafts the recovery copy, which is
  passed through the compliance guard (ABN + unsubscribe) and gated T2 before send.
- **Trigger:** failed-payment webhook. **Runtime:** Edge Function + pgmq.
- **Gate tier:** T2 send. **Model:** Sonnet (copy only).
- **Expected monthly cost:** low; a few Sonnet drafts per failed payment.

Idempotent per invoice + attempt (`dunning:<invoice>:<attempt>`).
Evals: `dunning.eval.test.ts` — ladder, escalation, stable idempotency key.
