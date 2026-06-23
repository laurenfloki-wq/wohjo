# Bot 18 — Client onboarding

- **What it does:** guides employer setup (company profile -> sites ->
  supervisors -> first worker invited -> first seal) and tracks progress to the
  first sealed clock-on. Haiku drafts guidance; external messages gated T2.
- **Trigger:** new-client event. **Runtime:** Edge Function + pgmq.
- **Gate tier:** T2 external msg. **Model:** Haiku (guidance).
- **Expected monthly cost:** ~0 AUD.

Evals: `onboarding.eval.test.ts` — step advance, progress %, completion.
