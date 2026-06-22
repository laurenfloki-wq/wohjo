# Bot 35 — Invoicing

- **What it does:** issues a compliant tax invoice (ABN attached, GST split),
  numbered deterministically from the billing event id so there is never a
  duplicate invoice. Fails closed if the ABN is not configured.
- **Trigger:** billing webhook.
- **Runtime:** Edge Function + pgmq.
- **Gate tier:** T0.
- **Model:** none.
- **Expected monthly cost:** 0 AUD.

Evals: `invoicing.eval.test.ts` — ABN attached, GST correct, stable invoice
number, fail-closed without ABN.
