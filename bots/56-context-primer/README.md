# Bot 56 — Context primer maintenance

- **What it does:** on a canonical-pack change, diffs the pack (deterministic) and Sonnet updates the Notion primer so other bots stay grounded. No diff means no LLM call.
- **Trigger:** canonical-pack change (repo push). **Runtime:** GitHub Actions. **Gate:** T1. **Model:** Sonnet.
- **Expected monthly cost:** low.
  Evals: `primer.eval.test.ts` — added/removed/changed diff, no-change short-circuit.
