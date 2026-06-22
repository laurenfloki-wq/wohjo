# Bot 45 — Release notes

- **What it does:** on release, categorises merged PRs by conventional-commit
  prefix and renders a deterministic, emoji-free changelog. Haiku only smooths
  the prose; the structure and accuracy are deterministic.
- **Trigger:** release. **Runtime:** GitHub Actions.
- **Gate tier:** T1. **Model:** Haiku (prose only).
- **Expected monthly cost:** ~0 AUD.

Evals: `release-notes.eval.test.ts` — kind derivation, deterministic render,
emoji rejection.
