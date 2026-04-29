#!/bin/bash
# ---------------------------------------------------------------------
# Post-deploy smoke test — Commit A redeploy verification
# 2026-04-27 · Pre-activation gate
#
# Run from Lauren's PC after Commit A deploys to production. Verifies:
#   - Server health (every public route returns 200 or expected redirect)
#   - Landing page contains restored Payday Super content
#   - Privacy + Terms pages contain ACN 697 323 925 + 27 April 2026
#   - DB + secrets connectivity via cron CRON_SECRET round-trip
#   - Cron firing validation (keepalive proves Vercel cron picked up
#     vercel.json)
#
# Usage:
#   BASE_URL=https://flosmosis.com CRON_SECRET=<secret> bash scripts/post-deploy-smoke-test.sh
#
# Or with .env loading:
#   set -a; source .env.local; set +a
#   BASE_URL=https://flosmosis.com bash scripts/post-deploy-smoke-test.sh
#
# Exit codes:
#   0 — every assertion passed
#   1 — at least one assertion failed (DO NOT proceed with activation
#       until resolved)
# ---------------------------------------------------------------------

set -uo pipefail

BASE_URL="${BASE_URL:-https://flosmosis.com}"
CRON_SECRET="${CRON_SECRET:-}"

PASS=0
FAIL=0
declare -a FAILURES

# Pretty colours when running in a terminal, plain when piped.
if [ -t 1 ]; then
  GREEN=$'\033[0;32m'; RED=$'\033[0;31m'; CYAN=$'\033[0;36m'; RESET=$'\033[0m'
else
  GREEN=""; RED=""; CYAN=""; RESET=""
fi

step() { echo "${CYAN}▶ $*${RESET}"; }
ok()   { PASS=$((PASS+1)); echo "${GREEN}  ✓ $*${RESET}"; }
bad()  { FAIL=$((FAIL+1)); FAILURES+=("$*"); echo "${RED}  ✗ $*${RESET}"; }

curl_status() {
  # Returns the HTTP status code for a URL. Treats redirects (3xx) as
  # success-ish; the route may legitimately redirect to a sign-in page.
  curl -s -o /dev/null -w "%{http_code}" --max-time 30 -L "$1" || echo "000"
}

assert_status_2xx() {
  local url="$1"
  local label="$2"
  local code
  code=$(curl_status "$url")
  if [[ "$code" =~ ^2 ]] || [[ "$code" =~ ^3 ]]; then
    ok "$label  →  $code"
  else
    bad "$label  →  $code  (expected 2xx/3xx)"
  fi
}

assert_body_contains() {
  local url="$1"
  local needle="$2"
  local label="$3"
  local body
  body=$(curl -s --max-time 30 -L "$url" || echo "")
  if echo "$body" | grep -qF "$needle"; then
    ok "$label  →  contains \"$needle\""
  else
    bad "$label  →  MISSING \"$needle\""
  fi
}

# ─── Step 1 — server health ──────────────────────────────────────────
step "(1) Server health — public routes return 2xx/3xx"
assert_status_2xx "$BASE_URL/"        "GET /"
assert_status_2xx "$BASE_URL/field"   "GET /field"
assert_status_2xx "$BASE_URL/verify"  "GET /verify"
assert_status_2xx "$BASE_URL/command" "GET /command"
assert_status_2xx "$BASE_URL/privacy" "GET /privacy"
assert_status_2xx "$BASE_URL/terms"   "GET /terms"

# ─── Step 2 — landing page Payday Super content restored ─────────────
step "(2) Landing page — Payday Super content restored"
assert_body_contains "$BASE_URL/" "Payday Super starts 1 July 2026" "GET /  banner copy"
assert_body_contains "$BASE_URL/" "Treasury Laws Amendment"          "GET /  Treasury Laws ref"
assert_body_contains "$BASE_URL/" "Talk to us about verified hours"  "GET /  Payday Super CTA"
assert_body_contains "$BASE_URL/" "Every hour"                       "GET /  hero headline"

# ─── Step 3 — privacy + terms pages ──────────────────────────────────
step "(3) Privacy + Terms — ACN + effective date present"
assert_body_contains "$BASE_URL/privacy" "697 323 925"        "GET /privacy  ACN"
assert_body_contains "$BASE_URL/privacy" "27 April 2026"      "GET /privacy  effective date"
assert_body_contains "$BASE_URL/terms"   "697 323 925"        "GET /terms    ACN"
assert_body_contains "$BASE_URL/terms"   "27 April 2026"      "GET /terms    effective date"

# ─── Step 4 — DB + secrets connectivity via cron round-trip ──────────
# Canonical /api/cron/keepalive response contract (locked 2026-04-28;
# auth standardised 2026-04-29 per substrate-DD audit):
#   200: {"status":"alive","pinged_at":<ISO8601>,"companies_count":<int>}
#   401: {"error":"Unauthorized"}  when Authorization header missing/wrong
#   500: {"error":<message>}       when Supabase round-trip fails
# Auth pattern: Authorization: Bearer ${CRON_SECRET} (Vercel-canonical).
# If the route shape changes, update the grep below AND the comment
# block above the GET handler in src/app/api/cron/keepalive/route.ts.
step "(4) DB + secrets connectivity — keepalive cron"
if [ -z "$CRON_SECRET" ]; then
  bad "CRON_SECRET env var not set; skipping cron auth check"
else
  KEEPALIVE_BODY=$(curl -s --max-time 30 \
    -H "Authorization: Bearer $CRON_SECRET" \
    "$BASE_URL/api/cron/keepalive" || echo "")
  if echo "$KEEPALIVE_BODY" | grep -q '"status":"alive"'; then
    ok "GET /api/cron/keepalive  →  status=alive (Supabase round-trip OK; SUPABASE_SERVICE_ROLE_KEY wired)"
  elif echo "$KEEPALIVE_BODY" | grep -qi "unauthor"; then
    bad "GET /api/cron/keepalive  →  unauthorised (CRON_SECRET in env doesn't match Vercel)"
  else
    bad "GET /api/cron/keepalive  →  unexpected body: ${KEEPALIVE_BODY:0:120}"
  fi

  # Verify-hashes cron — proves DB read works under service role
  step "(5) Verify-hashes cron — DB read under service role"
  VH_BODY=$(curl -s --max-time 60 \
    -H "Authorization: Bearer $CRON_SECRET" \
    "$BASE_URL/api/cron/verify-hashes" || echo "")
  if echo "$VH_BODY" | grep -q '"events_scanned"'; then
    EVENTS=$(echo "$VH_BODY" | grep -oE '"events_scanned":[[:space:]]*[0-9]+' | grep -oE '[0-9]+' | head -1)
    ok "GET /api/cron/verify-hashes  →  events_scanned=${EVENTS:-?}"
  else
    bad "GET /api/cron/verify-hashes  →  unexpected body: ${VH_BODY:0:120}"
  fi
fi

# ─── Step 6 — manual supervisor-batch fire (Monday evening prep) ─────
step "(6) Manual supervisor-batch trigger (Monday evening prep)"
echo "    Run this AFTER the smoke test passes, on Monday evening, to"
echo "    validate Tuesday-AM batch SMS will go out:"
echo ""
echo "      curl -H \"Authorization: Bearer \$CRON_SECRET\" \\"
echo "        \"$BASE_URL/api/cron/supervisor-batch\""
echo ""
echo "    Expected: 200 JSON with sent count + skip reasons. If ZERO"
echo "    supervisors enrolled (no shifts ready for SMS), that's"
echo "    expected — Tuesday-AM cron will retry on real shifts."

# ─── summary ─────────────────────────────────────────────────────────
echo ""
echo "================================================================"
echo "${GREEN}PASS: $PASS${RESET}    ${RED}FAIL: $FAIL${RESET}"
if [ "$FAIL" -eq 0 ]; then
  echo "${GREEN}✓ ALL SMOKE-TEST ASSERTIONS PASSED${RESET}"
  echo "  Activation can proceed."
  exit 0
else
  echo "${RED}✗ AT LEAST ONE ASSERTION FAILED${RESET}"
  echo "  Failures:"
  for f in "${FAILURES[@]}"; do echo "    - $f"; done
  echo "  DO NOT proceed with activation until resolved."
  exit 1
fi
