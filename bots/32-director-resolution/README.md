# Bot 32 — Director resolution

- **What it does:** Sonnet drafts the minute; the register entry is valid only with title, decision, date, and approval from BOTH directors (Lauren Kate de Mestre and João Muniz Campos). Dual-control (T3); director-signed.
- **Trigger:** decision (manual). **Runtime:** Edge Function (HTTP). **Gate:** T3. **Model:** Sonnet.
- **Expected monthly cost:** low.
  Evals: `resolution.eval.test.ts` — both-director validity, single-director invalid, missing fields.
