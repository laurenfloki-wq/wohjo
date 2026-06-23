# Bot 4 — Social publishing

- **What it does:** publishes already-approved posts on time, idempotently.
  Only posts that cleared the T2 drafting gate (status 'approved') are ever
  selected; the due-selection and idempotency key are deterministic, so a re-run
  never double-posts.
- **Trigger:** schedule. **Runtime:** pg_cron -> Edge Function.
- **Gate tier:** T1 (publishing pre-approved content). **Model:** none.
- **Expected monthly cost:** 0 AUD.

Evals: `publishing.eval.test.ts` — stable key, approved+due only, schedule order.
