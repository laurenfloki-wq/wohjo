# Bot 55 — Document filing

- **What it does:** classifies a document (Haiku for borderline) and files it with a deterministic name (TYPE_subject_DATE_vN), version, and AU retention period. Reversible; same inputs always produce the same name.
- **Trigger:** Drive webhook. **Runtime:** Edge Function. **Gate:** T0. **Model:** Haiku.
- **Expected monthly cost:** ~0 AUD.
  Evals: `filing.eval.test.ts` — naming, versioning, retention.
