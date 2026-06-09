#!/usr/bin/env bash
# Stage 2 branch protection — promote "Real-PG full-graph attestation"
# to required status check on main.
#
# Prerequisite (per dispatch §A6): at least two consecutive green
# full-graph attestation runs. As of 2026-06-09 (3e3a099 + 9ceb7db),
# both are green and the references all match.
#
# This is a SHARED-STATE, IRREVERSIBLE-BY-PR change. Lauren runs it,
# not Code. Hence this is a script, not an automated step.
#
# Pre-check: current required contexts (must include "Run 7 bulletproof
# scenarios" from Stage 1).
set -euo pipefail

OWNER=laurenfloki-wq
REPO=wohjo
BRANCH=main

echo "Current required status checks on main:"
gh api "repos/$OWNER/$REPO/branches/$BRANCH/protection/required_status_checks" \
  --jq '.contexts[]'
echo ""

# Append the new context to the existing required_status_checks.contexts.
# We MUST do a full PUT (PATCH on required_status_checks alone is
# unsupported in branch protection v3). Read current settings, splice
# in the new context, write back.

EXISTING_JSON=$(gh api "repos/$OWNER/$REPO/branches/$BRANCH/protection")

NEW_PROTECTION=$(echo "$EXISTING_JSON" | python -c '
import json, sys
d = json.load(sys.stdin)
contexts = d.get("required_status_checks", {}).get("contexts", []) or []
if "Real-PG full-graph attestation" not in contexts:
    contexts.append("Real-PG full-graph attestation")
out = {
    "required_status_checks": {
        "strict": d.get("required_status_checks", {}).get("strict", False),
        "contexts": contexts,
    },
    "enforce_admins": d.get("enforce_admins", {}).get("enabled", False),
    "required_pull_request_reviews": d.get("required_pull_request_reviews"),
    "restrictions": d.get("restrictions"),
    "allow_force_pushes": d.get("allow_force_pushes", {}).get("enabled", False),
    "allow_deletions": d.get("allow_deletions", {}).get("enabled", False),
}
print(json.dumps(out))
')

echo "Proposed required_status_checks:"
echo "$NEW_PROTECTION" | python -c 'import json,sys; d=json.load(sys.stdin); print("  " + "\n  ".join(d["required_status_checks"]["contexts"]))'
echo ""
read -p "Apply? [y/N] " ans
[[ "$ans" == "y" || "$ans" == "Y" ]] || { echo "Aborted."; exit 0; }

echo "$NEW_PROTECTION" | gh api -X PUT "repos/$OWNER/$REPO/branches/$BRANCH/protection" --input -

echo ""
echo "Done. New required contexts:"
gh api "repos/$OWNER/$REPO/branches/$BRANCH/protection/required_status_checks" \
  --jq '.contexts[]'
