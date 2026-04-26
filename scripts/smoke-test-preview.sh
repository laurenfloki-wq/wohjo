#!/usr/bin/env bash
# FLOSTRUCTION preview smoke-test — P4 deliverable 2026-04-24
#
# Runs the 12-test suite from Desktop/smoke-test-preview-script (2026-04-23)
# against any Vercel preview URL without requiring the sandbox egress
# allowlist. Uses bash + curl only — no build step, no dependencies.
#
# Usage:
#   ./scripts/smoke-test-preview.sh <preview-url>
#   ./scripts/smoke-test-preview.sh https://wohjo-abc123-wohjos-projects.vercel.app
#
# Exit code:
#   0 = all 12 tests passed
#   N = N tests failed (cap at 255)
#
# The script prints each test's expected/actual HTTP code and body. A
# trailing summary block lists any failures with enough detail to act
# on. The three tests most critical to the P0 fixes (1.2, 2.2, 3.2) are
# tagged [P0-CRITICAL] — if any of those fails, the named-security
# regression is live and the commit should NOT go to prod.

set -o pipefail

# ── Argument handling ────────────────────────────────────────────────
if [ $# -lt 1 ]; then
  echo "usage: $0 <preview-url>" >&2
  echo "example: $0 https://wohjo-abc123-wohjos-projects.vercel.app" >&2
  exit 2
fi
BASE="${1%/}"  # strip any trailing slash
FAKE="00000000-0000-0000-0000-000000000000"
FAIL_COUNT=0
FAIL_LINES=()

# ── Terminal colour (opt-in) ─────────────────────────────────────────
if [ -t 1 ] && command -v tput >/dev/null 2>&1; then
  GREEN=$(tput setaf 2); RED=$(tput setaf 1); YELLOW=$(tput setaf 3); BOLD=$(tput bold); RESET=$(tput sgr0)
else
  GREEN=""; RED=""; YELLOW=""; BOLD=""; RESET=""
fi

# ── Helpers ──────────────────────────────────────────────────────────
banner() {
  echo ""
  echo "${BOLD}=================================================================${RESET}"
  echo "${BOLD}$1${RESET}"
  echo "${BOLD}=================================================================${RESET}"
}

# test_case <id> <label> <METHOD> <path> <body|""> <expected_code> [<expected_body_substring>]
test_case() {
  local id="$1" label="$2" method="$3" path="$4" body="$5"
  local expected_code="$6" expected_substring="${7:-}"

  echo ""
  echo "${BOLD}[$id] $label${RESET}"
  echo "   expect: HTTP $expected_code${expected_substring:+, body contains '$expected_substring'}"

  local curl_args=(-s -w "\n__HTTP__:%{http_code}" -X "$method" \
    -A "flostruction-smoke-test/1.0" --max-time 15)
  if [ -n "$body" ]; then
    curl_args+=(-H "Content-Type: application/json" -d "$body")
  fi

  local resp
  resp=$(curl "${curl_args[@]}" "$BASE$path" 2>&1)
  local actual_body actual_code
  actual_body=$(echo "$resp" | sed '/^__HTTP__:/d')
  actual_code=$(echo "$resp" | grep '^__HTTP__:' | cut -d: -f2)

  # Default actual_code to 000 if curl failed entirely.
  actual_code="${actual_code:-000}"

  local code_ok=0 body_ok=1
  [ "$actual_code" = "$expected_code" ] && code_ok=1
  if [ -n "$expected_substring" ]; then
    body_ok=0
    echo "$actual_body" | grep -Fq -- "$expected_substring" && body_ok=1
  fi

  if [ "$code_ok" = "1" ] && [ "$body_ok" = "1" ]; then
    echo "   ${GREEN}PASS${RESET}  actual HTTP $actual_code"
    echo "   body: $(echo "$actual_body" | head -c 200)"
  else
    echo "   ${RED}FAIL${RESET}  actual HTTP $actual_code"
    echo "   body: $(echo "$actual_body" | head -c 500)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    FAIL_LINES+=("[$id] $label — expected $expected_code, got $actual_code${expected_substring:+, expected body '$expected_substring'}")
  fi
}

# ── Pre-flight: is the preview reachable at all? ─────────────────────
banner "PRE-FLIGHT — is $BASE reachable?"
preflight_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE/")
echo "HTTP $preflight_code on GET $BASE/"
if [ "$preflight_code" = "000" ]; then
  echo "${RED}Preview unreachable. Check URL, network, DNS. Aborting.${RESET}"
  exit 3
fi

# ═════════════════════════════════════════════════════════════════════
# P0-1  /api/verify/shifts — requires verify_token
# ═════════════════════════════════════════════════════════════════════
banner "P0-1  /api/verify/shifts — token-required auth"

test_case "1.1" "no token at all" \
  "GET" "/api/verify/shifts?status=SUBMITTED" "" \
  "401" "token required"

test_case "1.2" "[P0-CRITICAL] legacy bypass — supervisor_id only, no token" \
  "GET" "/api/verify/shifts?supervisor_id=$FAKE&status=SUBMITTED" "" \
  "401" "token required"

test_case "1.3" "garbage token" \
  "GET" "/api/verify/shifts?token=deadbeef-dead-beef-dead-beefdeadbeef&status=SUBMITTED" "" \
  "401" "Invalid or expired token"

# ═════════════════════════════════════════════════════════════════════
# P0-2  /api/verify/approve/[shiftId] — token in body, not supervisor_id
# ═════════════════════════════════════════════════════════════════════
banner "P0-2  /api/verify/approve/[shiftId]"

test_case "2.1" "empty body" \
  "POST" "/api/verify/approve/$FAKE" "{}" \
  "401" "MISSING_TOKEN"

test_case "2.2" "[P0-CRITICAL] legacy bypass — supervisor_id + phone only" \
  "POST" "/api/verify/approve/$FAKE" \
  "{\"supervisor_id\":\"$FAKE\",\"supervisor_phone\":\"+61400000000\"}" \
  "401" "MISSING_TOKEN"

test_case "2.3" "garbage token" \
  "POST" "/api/verify/approve/$FAKE" \
  "{\"verify_token\":\"deadbeef-dead-beef-dead-beefdeadbeef\"}" \
  "401" "Invalid or expired token"

# ═════════════════════════════════════════════════════════════════════
# P0-3  /api/verify/dispute/[shiftId]
# ═════════════════════════════════════════════════════════════════════
banner "P0-3  /api/verify/dispute/[shiftId]"

test_case "3.1" "empty body" \
  "POST" "/api/verify/dispute/$FAKE" "{}" \
  "401" "MISSING_TOKEN"

test_case "3.2" "[P0-CRITICAL] legacy bypass + reason" \
  "POST" "/api/verify/dispute/$FAKE" \
  "{\"supervisor_id\":\"$FAKE\",\"reason\":\"test\"}" \
  "401" "MISSING_TOKEN"

test_case "3.3" "token present but no reason" \
  "POST" "/api/verify/dispute/$FAKE" \
  "{\"verify_token\":\"deadbeef-dead-beef-dead-beefdeadbeef\"}" \
  "400" "reason required"

test_case "3.4" "token + reason but token invalid" \
  "POST" "/api/verify/dispute/$FAKE" \
  "{\"verify_token\":\"deadbeef-dead-beef-dead-beefdeadbeef\",\"reason\":\"test dispute\"}" \
  "401" "Invalid or expired token"

# ═════════════════════════════════════════════════════════════════════
# P0-4  /api/founding — rate limit + zod
# ═════════════════════════════════════════════════════════════════════
banner "P0-4  /api/founding — rate-limit + zod + sanitise"

test_case "4.1" "empty body" \
  "POST" "/api/founding" "{}" \
  "400" "Invalid payload"

test_case "4.2" "phone too short" \
  "POST" "/api/founding" "{\"phone\":\"x\"}" \
  "400" "Invalid payload"

test_case "4.3" "phone with SQL injection probe" \
  "POST" "/api/founding" "{\"phone\":\"+61400000000'; DROP TABLE founding_leads--\"}" \
  "400" "Invalid payload"

test_case "4.4" "GET counter endpoint" \
  "GET" "/api/founding" "" \
  "200" "spotsRemaining"

# ═════════════════════════════════════════════════════════════════════
# SUMMARY
# ═════════════════════════════════════════════════════════════════════
banner "SUMMARY"
TOTAL=12
PASS_COUNT=$((TOTAL - FAIL_COUNT))
echo ""
if [ "$FAIL_COUNT" = "0" ]; then
  echo "${GREEN}${BOLD}ALL $TOTAL TESTS PASSED${RESET}"
  echo ""
  echo "P0-1/2/3 security patches and P0-4 validation are live on preview."
  echo "Safe to continue to production smoke test when ready."
  exit 0
else
  echo "${RED}${BOLD}$FAIL_COUNT of $TOTAL TESTS FAILED${RESET}"
  echo ""
  echo "Failures:"
  for line in "${FAIL_LINES[@]}"; do
    echo "  - $line"
  done
  echo ""
  echo "Any failure on [P0-CRITICAL] tests (1.2, 2.2, 3.2) indicates the"
  echo "named-security regression is live. Do NOT push to production."
  # Cap exit code at 255
  if [ "$FAIL_COUNT" -gt 255 ]; then
    exit 255
  else
    exit "$FAIL_COUNT"
  fi
fi
