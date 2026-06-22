# Bot 46 — QA/test generation

- **What it does:** detects changed source files in a PR that lack an adjacent
  test in the same changeset (deterministic), then Sonnet drafts tests for them.
  Drafted tests must compile and run before the T2-gated merge.
- **Trigger:** new code path (PR). **Runtime:** GitHub Actions.
- **Gate tier:** T2 merge. **Model:** Sonnet (draft tests).
- **Expected monthly cost:** low; scales with changed source files.

Evals: `qa.eval.test.ts` — test/source classification, coverage-gap detection.
