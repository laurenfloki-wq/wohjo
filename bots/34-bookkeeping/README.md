# Bot 34 — Bookkeeping (Stripe to Xero)

- **What it does:** maps each Stripe charge to a Xero bank transaction with a
  correct GST split and a Stripe-fee line. Durable and idempotent on the Stripe
  event id — a redelivered webhook or re-drained queue posts exactly once.
- **Trigger:** Stripe webhook + daily sweep.
- **Runtime:** Edge Function receiver (`supabase/functions/stripe-webhook`) +
  pgmq worker (`worker.ts`, drained per minute by pg_cron); daily reconciling sweep.
- **Gate tier:** T1 (autonomous, notify-after).
- **Model:** Haiku, edge expense categories only — not on the happy path.
- **Expected monthly cost:** ~0 AUD; LLM only fires on genuinely ambiguous
  categories (a handful of low-token Haiku calls per month).

Idempotency: `claimIdempotency('stripe-event:<id>')` plus the Xero `Reference`
(`stripe:<event-id>`) as defence in depth. GST via `platform/money` (round-half-up,
integer cents, net + gst = gross). Evals: `bookkeeping.eval.test.ts`.
