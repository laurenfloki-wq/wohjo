# Bot 44 — Incident triage

- **What it does:** on a Sentry alert, groups events by fingerprint and assigns
  a deterministic priority (P1/P2/P3) from user impact + regression + volume.
  Sonnet drafts a cause hypothesis and a fix PR grounded in the gathered logs;
  the merge is gated T2.
- **Trigger:** Sentry webhook. **Runtime:** Edge Function + pgmq (may dispatch GHA).
- **Gate tier:** T2 merge. **Model:** Sonnet (cause + draft PR).
- **Expected monthly cost:** low; one Sonnet draft per distinct incident.

Evals: `incident.eval.test.ts` — priority assignment, grouping worst-first.
