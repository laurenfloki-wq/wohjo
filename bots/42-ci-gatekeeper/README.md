# Bot 42 — CI gatekeeper

- **What it does:** enforces the fleet Ship Gate (strict typecheck + the full
  eval suite) on every PR touching fleet code, so a failing fleet change cannot
  merge to a protected branch. Implemented as `.github/workflows/fleet-ci-gate.yml`
  (PR-triggered) alongside the gate job in `fleet-deploy.yml` (push to main).
- **Trigger:** PR/push. **Runtime:** GitHub Actions.
- **Gate tier:** T1. **Model:** none.
- **Expected monthly cost:** 0 AUD (GitHub Actions free tier).

Make `Fleet Ship Gate` a required status check on the protected branch to make
the block enforceable.
