# Bot 57 — Approval router (the spine)

- **What it does:** one queue for every human gate. Collects pending approvals,
  notifies directors (email + SMS), and on resolution resumes the exact parked
  pgmq message (approve) or enqueues the compensating action (reject). Every
  resolution writes to the ledger.
- **Trigger:** gate events + UI + expiry sweep.
- **Runtime:** Edge Function (API) + Vercel (UI) + pg_cron (expiry sweep).
- **Gate tier:** infra (it is the gate mechanism).
- **Model:** none.
- **Expected monthly cost:** 0 AUD (notifications via existing Resend/Twilio;
  no LLM).

Built immediately after the platform. Backed by `platform/hitl.ts`.

Evals: `router.eval.test.ts` — resume on approval, compensate on rejection,
no-op on already-resolved.
