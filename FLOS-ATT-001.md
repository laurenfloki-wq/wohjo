# FLOS-ATT-001 — FLOSTRUCTION Activation Attestation

- Date: 2026-06-04
- Repo: laurenfloki-wq/wohjo
- Working branch: claude/blissful-mccarthy-ec2Wb
- Substrate: Supabase rwnxnnudljpgyfwbnosu ("FLOSTRUCTION", ap-southeast-2)
- Author: autonomous engineering executor (Claude Code)

This is an honest, evidence-backed status. The Definition of Done requires
all five acceptance conditions GREEN. **That bar is NOT met in this run:**
two conditions are blocked by credentials that are not present in this
execution environment, and one (Jobs Standard UX) is substantial outstanding
work. Where a condition is GREEN, evidence is attached. Nothing is overstated.

## Ground truth (verified, not asserted)

- HEAD at start: `0fbec4b`. Working branch clean.
- Substrate baseline confirmed by live query: **32 shift_events, 0 WLES-
  enveloped, all `spec_version='0'`, 5 genesis rows, last event 2026-05-12,
  1 worker / 1 company.** Matches the dispatch baseline.
- WLES v1 code is present and complete: `src/lib/wles/` (hash, chain-verify,
  v1, v1-chain, v1-translate, flags, sync-guard, types) with gated callsites
  (`src/app/api/field/shift/start/route.ts:144`, fail-closed flag).
- State classification: **Case A** — v1 code present, flag OFF, 100% v0.
- Correction to dispatch claim: this branch has 72 commits, not 120.

## Acceptance conditions

### [1] WLES_V1_ENABLED=true in production; new events 100% enveloped — BLOCKED (credential)

- This environment has **no Vercel credential** (no token, no
  `.vercel/project.json`, CLI present but unauthenticated). The production
  env var cannot be flipped from here, and its current prod value cannot be
  read. The flag flip is the first domino; the forward bridge must anchor to
  the v1 tip created _after_ the flip, so it cannot correctly precede it.
- No raw INSERT into the live forensic chain was performed — doing so would
  bypass the validated code path and risk permanent corruption of an
  append-only legal ledger. Exact unblock commands: see FLOS-DL-AUTO-001 D-1.

### [2] End-to-end on the V1 path verified; export produced — GREEN (SIMULATED)

- A full-lifecycle E2E runs through the **real v1.0 code path** (real
  builders + canonical-JSON sealing + verifier): forward-bridge -> CLOCK_IN
  -> CLOCK_OUT -> APPROVAL -> EXPORT_RECORD. New test
  `src/test/integration/wles-v1-e2e.test.ts` (6/6 passing).
- Export produced and validated by the **independent** reference verifier
  (`scripts/wles-v1-verify.mjs`, zero dependency on `src/lib/wles`):
  `chain_verification: pass, events_scanned: 5, failures: []`.
  Evidence: `gate-reports/wles-v1-activation-2026-06-04/`.
- Labelled SIMULATED: drives the domain/sealing layer in process. A live
  HTTP E2E additionally needs the production runtime env (service-role key,
  flag on), absent here. The integrity-bearing layer is proven.

### [3] Security pass — SAST/SCA/secrets clean of HIGH/CRITICAL — GREEN

- SCA: the single HIGH (batch of Next.js CVEs) cleared by bumping
  `next 16.2.3 -> 16.2.7` (in-minor, non-breaking). Post-fix `npm audit`:
  **0 high, 0 critical.** Three moderates remain — all one upstream postcss
  CSS-stringify XSS bundled inside next/@serwist, `fixAvailable: false`
  pending an upstream next release (logged, not a HIGH/CRITICAL).
- Secrets: no hardcoded keys, JWTs, or private keys in tracked source. The
  only `sk_live_` matches are legitimate Stripe-mode _detection logic_.
- Manual review of the WLES hash-chain logic (scanners cannot reason about
  it): canonicalisation sorts keys, strips `undefined`, rejects non-finite
  numbers; the hash is computed over the event _excluding_ `event_hash`;
  both hashes are validated as 64-char lowercase hex; genesis must be
  ZERO_HASH; any reorder/forge/tamper fails verification. No logic flaw found.
- Full suite green throughout: **1505 passed, 4 skipped, 0 failed** (87 files).

### [4] Supabase leaked-password protection ON; advisors 0 ERROR — PARTIAL

- Advisors: **0 ERROR** (this half is GREEN). Exactly one WARN remains:
  leaked-password protection disabled (external-facing).
- The toggle is a GoTrue auth-config setting reachable only via the Supabase
  Management API / dashboard — **not exposed by the MCP tools available here
  and no Management API token is present.** Could not be enabled from this
  environment. Exact unblock action: see FLOS-DL-AUTO-001 D-2.

### [5] Jobs Standard experience bar — NOT MET (outstanding)

- A full top-of-market UX lift of the worker app and admin dashboard was not
  performed in this run. It requires running the app and visual/accessibility
  review, which this headless environment (no runtime env) cannot do, and
  blind cosmetic edits to a live field app would risk regressions. This is
  the major outstanding work item, scoped in FLOS-DL-AUTO-001 D-4.

### Cross-cutting: full-table chain integrity — GREEN

- Live query over all 32 events: **0 missing hashes, 0 duplicate hashes,
  5 genesis, 0 broken links, 0 fork points.** Chain intact.

## Gate result

NOT all-green. **GREEN: [2], [3], chain integrity. PARTIAL: [4] (0 ERROR;
toggle blocked). BLOCKED on credentials: [1], [4]-toggle. OUTSTANDING: [5].**
The blocked items are blocked by credentials/runtime absent from this
environment, not by unresolved engineering — each has an exact one-tap
unblock command in FLOS-DL-AUTO-001. No GREEN here is fabricated.

---

## v2 addendum — 2026-06-04 (Completion Dispatch v2 re-run)

PREFLIGHT was re-checked in this environment before any planning. **P-1
(Vercel), P-2 (Supabase Management), P-3 (app runtime .env), P-4 (gh) are
all absent here** — this is the same cloud container as the v1 run, not the
local-PC/tokens-wired session v2 assumes. Detail and unblock in
FLOS-DL-AUTO-001 D-8. Consequence: the prod-ship acceptance items cannot be
completed from this environment, and the gate cannot honestly move to
all-GREEN here.

Re-verified this run (real evidence):

- **Fingerprint tripwire CONFIRMED unchanged** — reproduced exactly:
  `md5(string_agg(id||':'||event_hash,'|' order by created_at,id))`
  = `8e6d4af90792eadb47f9205fe18e6325`. The 32 V0 events are byte-identical
  to baseline; forward-only integrity intact (D-9).
- **[3] Security re-verified GREEN** — npm audit 0 high / 0 critical; suite
  1505 passed / 0 failed (D-11).
- **Chain integrity GREEN** — 0 broken links on re-query.
- **[2] E2E GREEN** — unchanged (in-process real path + independent verifier).
- Export stub registry investigated: unreachable dead code, ratified Phase-2
  deferral — left unchanged, flagged for future cleanup (D-10).

Unchanged status: **[1], [4]-toggle, [5] still cannot be completed in this
environment.** What is needed is not more engineering but the PREFLIGHT
access — run where the tokens exist, or wire VERCEL_TOKEN +
SUPABASE_ACCESS_TOKEN + an app `.env` into this environment, then execute
FLOS-DL-AUTO-001 D-1 / D-2 as written.
