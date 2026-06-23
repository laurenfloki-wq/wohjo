# Bot 19 — Worker onboarding

- **What it does:** scripted PWA setup, geofence grant, first clock-on. The step
  progression is deterministic and idempotent — a redelivered event never
  advances twice or skips a step.
- **Trigger:** invite event. **Runtime:** Edge Function + pgmq.
- **Gate tier:** T1. **Model:** none.
- **Expected monthly cost:** 0 AUD.

Evals: `worker.eval.test.ts` — single-step advance, idempotent replay, no-skip, stable key.
