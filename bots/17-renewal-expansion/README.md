# Bot 17 — Renewal & expansion

- **What it does:** daily, detects upcoming renewals and per-active-worker
  growth, flagging each with evidence (days to renewal, worker growth and %).
  Detection is deterministic; the Haiku summary phrases the evidence and any
  outreach is gated T2.
- **Trigger:** daily. **Runtime:** pg_cron -> Edge Function.
- **Gate tier:** T2 outreach. **Model:** Haiku (summarise only).
- **Expected monthly cost:** ~0 AUD.

Evals: `renewal.eval.test.ts` — renewal-due, expansion with growth evidence,
combined, steady-state ignored.
