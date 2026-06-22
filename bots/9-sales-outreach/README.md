# Bot 9 — Sales outreach

- **What it does:** enriches a lead, Sonnet personalises the body, then
  buildOutreachEmail appends the ABN + functional unsubscribe and asserts Spam
  Act compliance. Drafts are taken to the send-edge but never auto-sent (T2).
- **Trigger:** manual enrol. **Runtime:** Edge Function (HTTP).
- **Gate tier:** T2 send. **Model:** Sonnet (personalise).
- **Expected monthly cost:** low.

Evals: `outreach.eval.test.ts` — compliant build; emoji + missing-unsubscribe blocked.
