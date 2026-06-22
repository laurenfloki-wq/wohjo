# Bot 30 — Compliance guard

- **What it does:** the deterministic gate every bot calls before any external
  send or data flow. Enforces the Spam Act 2003 (ABN + functional unsubscribe),
  output hygiene (no emoji), and grounding. A non-compliant send becomes
  impossible: the guard throws and callers must let it propagate.
- **Trigger:** inline (before any send/data flow).
- **Runtime:** in-process library.
- **Gate tier:** T0 hard block.
- **Model:** none (deterministic, never an LLM).
- **Expected monthly cost:** 0 AUD (no LLM, no infra of its own).

Evals: `compliance.eval.test.ts` — pass on compliant email; block on missing
ABN, missing unsubscribe, emoji; grounding citation checks.
