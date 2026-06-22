# Bot 43 — Dependency & security

- **What it does:** triages scan findings (Dependabot/CodeQL/Semgrep/Sentry).
  CVSS severity banding, the block decision, and dedupe are deterministic; Haiku
  only writes the triage summary. Blocks fixable critical/high; surfaces
  unfixable ones without blocking the pipeline indefinitely.
- **Trigger:** schedule + push. **Runtime:** GitHub Actions.
- **Gate tier:** T1. **Model:** Haiku (summary only).
- **Expected monthly cost:** ~0 AUD. Secret scanning stays on.

Evals: `security.eval.test.ts` — CVSS banding, block decisions, dedupe.
