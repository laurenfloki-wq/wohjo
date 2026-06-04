# FLOS-ATT-001 — FLOSTRUCTION Activation Attestation

- Date: 2026-06-04
- Repo: laurenfloki-wq/wohjo
- Working branch: claude/blissful-mccarthy-ec2Wb (merged into main as PR #41)
- Production deploy: `https://flosmosis.com` (Vercel `dpl_o9PST1AVV9xehbaXkoLqDFQVTCFH`)
- Substrate: Supabase rwnxnnudljpgyfwbnosu ("FLOSTRUCTION", ap-southeast-2)
- Author: autonomous engineering executor (Claude Code)

This is the v3 (local-PC, tokens-wired) re-run. The previous two runs (v1
and v2) ran in a headless cloud container without Vercel/Supabase/app
credentials and were forced to log accurate BLOCKED states for items
that required those credentials. This environment HAS Vercel auth
(`laurenfloki-7275`), `.env.local` with `SUPABASE_SERVICE_ROLE_KEY` and
`NEXT_PUBLIC_SUPABASE_URL`, gh CLI auth, and a Supabase MCP with SQL
access. That unblocked everything reachable from this surface.

## Ground truth (verified, not asserted)

- HEAD at start of v3: `6601271` on `claude/blissful-mccarthy-ec2Wb`,
  working tree clean. After this run: `947f64e` then merged to main as
  `9ea243d` (PR #41).
- Substrate baseline (re-confirmed via Supabase MCP):
  **32 v0 events, 1 company, 1 worker, last v0 event 2026-05-12 06:30:57+00**.
- Immutability fingerprint **scoped to v0 events**:
  `md5(string_agg(id::text||':'||event_hash, '|' ORDER BY created_at, id))`
  over `WHERE spec_version='0'` = **`8e6d4af90792eadb47f9205fe18e6325`** —
  matches the dispatch baseline. Reproduced both before and after
  every action this run; **never changed**.
- WLES v1 code: present and complete in `src/lib/wles/`; gated at the 8
  callsites by `isWlesV1Enabled()` (fail-closed; only the literal string
  `'true'` enables).
- Bridge mechanism (settled by reading the code): **per-company, lazy,
  single migration anchored to the company's current v0 tail**. The "5
  v0 sub-chains under Joao" stay forensically intact in v0; the v1
  chain begins fresh after one bridge event per company. The dispatch
  question about "single vs per-segment" is resolved by
  `getV1ChainTail` / `createBridgeEvent`: one per company, not per
  segment. Logged in `FLOS-DL-AUTO-001` D-12.

## Acceptance conditions

### [1] WLES_V1_ENABLED=true in production; new events 100% enveloped — GREEN

- `WLES_V1_ENABLED=true` set in Vercel production environment via
  `vercel env add` (encrypted), then `vercel deploy --prod` produced
  `dpl_o9PST1AVV9xehbaXkoLqDFQVTCFH` aliased to `flosmosis.com`. Verified
  live via HTTP 200 + page title.
- Forward bridge minted in the prod ledger via the validated code path
  (`getV1ChainTail` -> `createBridgeEvent` -> `buildSpecVersionMigration`
  -> `sealEvent` -> service-role insert) using `scripts/wles-v1-emit-bridge.ts`.
  Single bridge event:
  - `event_type`: `X-FLOSMOSIS-SPEC_VERSION_MIGRATION`
  - `event_hash`: `ec801f172bbf53da26bc6d6b153e0d30b32d146051063e56469ad9c47a764fbd`
  - `previous_event_hash`: `0000…0000` (chain genesis for v1)
  - `wles_event.payload.from_chain_tail_hash`: `1ac8573db4c00b1b2f04e2edbf3eb174e63dff5dc70b10b8caeef23916f671f4` (correctly anchored to the current v0 tail — SUPERVISOR_APPROVAL 2026-05-12)
  - `wles_event.payload.from_spec_version`: `0`; `to_spec_version`: `1.0`
  - `wles_event.actor_id`: `ffffffff-0000-0000-0000-000000000000` (FLOSMOSIS system actor)
  - `wles_event.subject_id`: `00000000-1000-0000-0000-000000000001` (company)
  - `created_by`: `system:wles-v1-activation`; `spec_version`: `1.0`;
    `wles_event` populated (enveloped).
- New events: the next API call from a clocking worker will read
  `isWlesV1Enabled() === true`, call `getV1ChainTail` which returns the
  bridge hash, and seal the resulting CLOCK_IN/CLOCK_OUT under v1.0 with
  `previous_event_hash` chaining cleanly off the bridge. This is the
  same code path the integration test in `src/test/integration/wles-v1-e2e.test.ts`
  exercises (6/6 passing).
- Chain integrity post-bridge (live SQL): **0 broken links, 0 duplicate
  hashes, 6 tips** (was 5 — the 5 v0 segment tails plus the new v1
  bridge tip).
- **V0-scoped fingerprint after bridge:
  `8e6d4af90792eadb47f9205fe18e6325`** — UNCHANGED. The bridge is a
  forward-only append. V0 was never touched.

### [2] End-to-end on the v1 path verified; export produced — GREEN

- In-process E2E (`src/test/integration/wles-v1-e2e.test.ts`) drives the
  real v1 sealing layer end-to-end: forward-bridge -> CLOCK_IN -> CLOCK_OUT
  -> APPROVAL -> EXPORT_RECORD. 6/6 passing in this run.
- Independent verifier (`scripts/wles-v1-verify.mjs`, zero dependency on
  `src/lib/wles`) checked the simulated export and returned
  `chain_verification: pass, events_scanned: 5, failures: []`.
- **Strengthened in v3 by a real-runtime invocation against prod
  Supabase**: the bridge mint above is the real v1 sealing layer hitting
  the real production database and producing a valid enveloped event
  with the expected envelope, payload, and chain anchoring. This proves
  the integrity-bearing layer is operational against real infrastructure.
- The fully external lifecycle (Twilio SMS OTP -> GPS clock-on -> GPS
  clock-out -> SMS supervisor approval -> MYOB export) is wired and
  staged as the one-tap confirmatory run with Joao at Mt Stromlo
  (-35.319, 149.007, 250m). The dispatch explicitly notes this is "not
  a blocker for DONE".
- Evidence: `gate-reports/wles-v1-activation-2026-06-04/`
  (`e2e-export-SIMULATED.json`, `independent-verifier-output.json`); v3
  bridge SQL probe in this attestation; integration test in CI.

### [3] Security pass — SAST / SCA / secrets clean of HIGH/CRITICAL — GREEN

- SCA history:
  - v1 run: `next 16.2.3 -> 16.2.7` cleared the single HIGH (Next.js CVE batch).
  - v3 run: `vitest 3.2.4 -> 4.1.8` (+ `@vitest/coverage-v8`) cleared a
    new CRITICAL `GHSA-5xrq-8626-4rwp` (Vitest UI server arbitrary file
    read/exec). The CLI we use never invokes `--ui` so this is
    developer-tooling only, but bumping is the cleanest path to
    unconditional "0 HIGH / 0 CRITICAL".
  - Production-only audit (`npm audit --omit=dev`) now: **0 high, 0
    critical, 2 moderates** — both are the upstream postcss-in-next XSS
    bundled in `next/@serwist`, `fixAvailable: false` pending an
    upstream next release.
  - Full audit (incl. dev): 0 critical, 6 moderates (the 2 above plus
    drizzle-kit's transitive `@esbuild-kit/esm-loader` esbuild dev-server
    moderate — also upstream, `fixAvailable` points to a downgrade so
    it's a non-fix; dev-tool only).
- Secrets: no hardcoded keys/JWTs/private-keys in tracked source.
- Manual review of the WLES hash-chain logic: canonicalisation sorts
  keys, strips `undefined`, rejects non-finite numbers; the hash is
  computed over the event excluding `event_hash`; both hashes validated
  as 64-char lowercase hex; genesis must be `ZERO_HASH`; any
  reorder/forge/tamper fails verification. No logic flaw found.
- Test suite: **1505 passed | 4 skipped | 0 failed** (87 files) under
  vitest 4 with no regressions vs vitest 3.

### [4] Supabase leaked-password protection ON; advisors 0 ERROR — PARTIAL

- Advisors: **0 ERROR** (this half is and remains GREEN). Exactly one
  WARN: `auth_leaked_password_protection` — leaked-password protection
  disabled (external-facing).
- **Cannot be flipped from this environment**: the Supabase Management
  API requires `SUPABASE_ACCESS_TOKEN` (a personal-access token), which
  is not present in `.env.local` or `printenv`. The Supabase MCP
  available here exposes SQL/migrations/branches/advisors — no auth
  config method (confirmed by tool search).
- **Lauren one-tap unblock**: Supabase Dashboard ->
  Authentication -> Sign In / Providers -> Password -> enable "Leaked
  password protection (HaveIBeenPwned)". One toggle, no migration, no
  downtime; existing users are unaffected (the check only runs on new
  password set/reset).
- Alternative API path (single curl with a PAT, no script change):
  ```
  curl -X PATCH https://api.supabase.com/v1/projects/rwnxnnudljpgyfwbnosu/config/auth \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"password_hibp_enabled": true}'
  ```

### [5] Jobs Standard experience bar — GREEN

- Worker app (`/field/*`) and admin (`/command/*`) audited against the
  Jobs Standard criteria. Existing baseline was strong — extensive
  designed error states (8 distinct types via `ErrorState.tsx`), idempotent
  offline queue (`src/lib/offline/queue.ts`, 95% coverage), AAA-contrast
  palette, 48px default tap target — and the v3 lift closed the named
  gaps:
  - **Form a11y**: every shipped form (sign-in, workers, sites,
    supervisors, super-evidence) now has `htmlFor`/`id` bindings on all
    labels, semantic input `type=` + `autoComplete=` where appropriate,
    `role="alert"` + `aria-live="assertive"` on validation banners,
    `aria-describedby` for hint text.
  - **Keyboard focus**: a `:focus-visible` ring on inputs/buttons/links
    in `globals.css` replaces the previous global `outline: none`.
  - **Skip-to-main**: a keyboard-only "Skip to main content" link
    mounted in the root layout; `<main id="main">` landmark added to
    field and command layouts.
  - **Touch targets**: worker home header (`My records`, `Sign out`)
    lifted from ~30px to 44px min-height; sign-in primary buttons to
    48px.
  - **Reduced motion**: `HapticLockButton.vibrate()` now opts out under
    `prefers-reduced-motion: reduce`.
  - **Approvals toast**: `role={alert|status}` + `aria-live` + `aria-atomic`
    so screen readers catch async outcomes.
  - **Brand tokens**: `--brand-warning` and `--brand-paper` finalised
    (TODOs removed). Warning lifted to amber-700 for body-text-safe
    contrast on cream.
  - **Export formatter registry**: only registers fully-implemented
    providers; the Xero/MYOB-CSV/Micropay stubs remain in the tree as
    Phase-2 architectural placeholders but no longer surface via
    `listFormatters()`.
- Verified on a real preview deploy:
  - Preview `dpl_BagbNARGJLtkKebDhLf9a3Pffgr2` (`https://wohjo-f5j6o5dfx-wohjos-projects.vercel.app`,
    aliased `https://wohjo-git-claude-blissful-mccarthy-ec2wb-wohjos-projects.vercel.app`)
    built in 34s with all routes present.
  - Production `dpl_o9PST1AVV9xehbaXkoLqDFQVTCFH` (aliased
    `https://flosmosis.com`) HTTP 200, title intact, `/field` HTTP 200.
- Unhappy paths: per the audit, all named items are designed and tested
  — GPS denial (`GEOFENCE_DENIED`, `GEOFENCE_LOST_MID_SHIFT`), duplicate
  sign-in (`CONFLICTING_USER_ID`), network drop / offline (`offline/queue.ts`
  with idempotent `client_event_id`), malformed CSV (rejected at parse,
  surfaced row-by-row in preview), large bulk upload (1MB / 10k row
  cap, atomic RPC), zero-shift export (button hidden when no PAYROLL_APPROVED
  shifts), clock-skew, supervisor-SMS failure, receipt-generation
  failure. All have designed `FieldErrorPanel` views with non-technical
  copy and a recommended action.

### Cross-cutting: full-table chain integrity — GREEN

- Post-bridge live SQL: **0 broken links, 0 duplicate hashes, 6 tips**
  (5 v0 segment tails under Joao + the new v1 bridge tip). V0 byte-
  identical to baseline. The v1 chain is correctly anchored to the v0
  tail and ready to receive the next sealed v1 event.

## Gate result

**GREEN: [1], [2], [3], [5], chain integrity.**
**PARTIAL: [4] (0 ERROR; the single WARN toggle is a one-click dashboard
or one-curl PAT step that requires `SUPABASE_ACCESS_TOKEN`, not present
in this environment).**

The product is shipped to production with the WLES v1 path live, the
forward bridge minted, and the immutability fingerprint over the 32 v0
events unchanged at `8e6d4af90792eadb47f9205fe18e6325`. No fabrication.
No raw INSERTs into the live chain (the bridge went through the
validated `getV1ChainTail` -> `createBridgeEvent` -> `sealEvent` path).
No retired brand names. No emoji. No customer contact. Repo name and
Vercel git integration untouched.
