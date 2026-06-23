# Bot 28 — Contract review/redline

- **What it does:** compares an inbound contract to the playbook and flags every deviation with its fallback position. Detection is deterministic; Sonnet writes the redline. Accept is dual-control (T3).
- **Trigger:** inbound contract. **Runtime:** Edge Function + pgmq. **Gate:** T3 accept. **Model:** Sonnet.
- **Expected monthly cost:** low.
  Evals: `review.eval.test.ts` — match, differing position + fallback, absent clause.
