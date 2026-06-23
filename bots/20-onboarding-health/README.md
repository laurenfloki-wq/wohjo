# Bot 20 — Onboarding health

- **What it does:** daily, tracks onboarding milestones (invited ->
  account_created -> first_worker -> first_seal) and surfaces stalled,
  incomplete onboardings, most-stalled first. Deterministic.
- **Trigger:** daily. **Runtime:** pg_cron -> Edge Function.
- **Gate tier:** T1/T2 (nudge vs escalate). **Model:** none.
- **Expected monthly cost:** 0 AUD.

Evals: `onboarding.eval.test.ts` — next-milestone, stalled detection + order.
