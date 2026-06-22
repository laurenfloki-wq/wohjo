# Bot 25 — Ticket triage

- **What it does:** classifies and prioritises inbound tickets deterministically
  (urgent/high/normal/low by impact + keywords) and routes to a queue
  (billing/technical/onboarding/general). Routing is T0; any reply is T2.
- **Trigger:** inbound-ticket webhook. **Runtime:** Edge Function.
- **Gate tier:** T0 route, T2 reply. **Model:** Haiku.
- **Expected monthly cost:** ~0 AUD.

Evals: `triage.eval.test.ts` — urgency, topic routing, impact scaling.
