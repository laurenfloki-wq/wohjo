# Bot 53 — Inbox triage

- **What it does:** classifies inbound mail (customer/vendor/internal/newsletter/spam), surfaces only what needs a director, and drafts customer-facing replies (T2, never auto-sent). Classification deterministic.
- **Trigger:** Gmail push webhook. **Runtime:** Edge Function + pgmq. **Gate:** T2 customer-facing. **Model:** Haiku/Sonnet.
- **Expected monthly cost:** low.
  Evals: `inbox.eval.test.ts` — customer surfacing, vendor/internal, spam/newsletter.
