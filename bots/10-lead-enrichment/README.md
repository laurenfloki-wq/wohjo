# Bot 10 — Lead enrichment

- **What it does:** normalises contacts (email, name case, AU phone to E.164)
  and dedupes before write-back, so no duplicate contacts and consistent fields.
  Apollo enrichment is a connector call; the normalise/dedupe logic is pure.
- **Trigger:** HubSpot webhook. **Runtime:** Edge Function + pgmq.
- **Gate tier:** T0. **Model:** Haiku (ambiguous normalisation only, off the happy path).
- **Expected monthly cost:** ~0 AUD.

Evals: `enrichment.eval.test.ts` — normalisation, AU phone, dedupe by email.
