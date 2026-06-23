# Bot 26 — Worker payroll-evidence

- **What it does:** answers a worker's question strictly from their sealed
  record. buildEvidence extracts the facts deterministically; Haiku phrases
  them; guardEvidenceAnswer asserts the answer cites exactly the sealed record,
  so a payroll claim can never be unsourced or speculated.
- **Trigger:** worker question (HTTP/chat). **Runtime:** Edge Function.
- **Gate tier:** T0. **Model:** Haiku (phrase).
- **Expected monthly cost:** ~0 AUD.

Evals: `evidence.eval.test.ts` — facts from record only; citation guard.
