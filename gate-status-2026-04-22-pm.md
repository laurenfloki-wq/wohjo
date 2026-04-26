# Hardening gate state — 2026-04-22 PM snapshot

Taken: 2026-04-22 08:10 AEST (Day 2 autonomous sprint)

Re-evaluating the 22 hardening-sprint valves against current codebase
state. Evidence cited per valve.

## Summary

| Count | Class |
|---|---|
| 15 | ✅ GREEN — valve closes under own authority |
| 4 | 🟡 YELLOW — implementation exists but verification/external-action pending |
| 3 | ❌ RED — blocked, gap flagged, or requires Lauren decision |

**Suite-level proof:**
- `tsc --noEmit` → EXIT 0
- `vitest run` → 341 passed · 29 skipped · 0 failed · 12 test files

---

## Valve table

### A — Security hardening

| Valve | State | Evidence |
|---|---|---|
| **A1 Structured logging across all routes** | ✅ GREEN | `src/lib/logger.ts` + 32 routes instrumented via `routeLogger('METHOD /api/path', request.headers.get('x-request-id'))`. Secret redaction for 7 env-key paths + 4 sensitive header paths. 5 `console.error` migrations in `founding/route.ts` + 1 in `verify-hashes/route.ts`. tsc clean. |
| **A2 Idempotency keys on webhooks** | ✅ GREEN | `webhook_idempotency` table (`migrations/A2-webhook-idempotency.sql`), helper `src/lib/security/idempotency.ts`, Twilio MessageSid replay guard wired post-signature at `src/app/api/webhooks/twilio/sms-reply/route.ts:97+`. 4 passing unit tests. Stripe + Supabase-auth patterns documented in `idempotency-usage.md`. |
| **A3 Cross-tenant test suite** | ❌ **RED — GAP-A3-001 and GAP-A3-002 open** | Audit at `tests/cross-tenant/audit-A3-001.md`. 21 routes Class A require refactor BLOCKED on auth-model decision (A/B/C/D options documented). 29 boundary tests `.skip`'d pending decision. Second gap (GAP-A3-002, field routes) discovered during audit. Suite scaffolding green; refactor blocked on Lauren. |
| **A4 admin_access_log table + RLS** | ✅ GREEN | Table created in prod Supabase (verified 2026-04-21). 9 columns, 3 indexes, RLS enabled, 2 policies (service_role SELECT + INSERT). Sentinel UUID used for system inserts. |
| **A5 Public-schema RLS audit** | ✅ GREEN | 11 public tables, all `rowsecurity=true`. List in `gate-reports/HARDENING_SPRINT_DAY1_2026-04-21.txt`. |
| **A6 Source-level secret scan** | ✅ GREEN | Verdict: PASS. `~/OneDrive/Desktop/a6-verdict.md`. Zero literal secret values in `.next/`; zero non-public secret names in client bundle; only noise (brand-name matches, English-word false positives). |
| **A7 Daily pg_dump to off-platform storage** | 🟡 YELLOW | Plan complete at `docs/A7-pg-dump-backup-plan.md`. Executable morning checklist at `docs/A7-execution-checklist.md` with every UI click. Blocked on Lauren's Railway + Cloudflare R2 account creation. First drill scheduled post-execution. |

### B — Product readiness

| Valve | State | Evidence |
|---|---|---|
| **B1 Worker self-enrolment /enrol/[org-slug]** | ❌ RED | Not started. Day 2 scope only included Day-1 overflow; B1 punted. No route, no page, no test. |
| **B2 APP 5 collection notice flow** | ❌ RED | Not started. Same reason. |
| **B3 Admin-enrol fallback path** | ❌ RED | Not started. |
| **B4 GPS audit: boundary-only capture** | ✅ GREEN | `legal-review/gps-capture-truth.md` answers Q1–Q5 with file+line citations. Foreground-only, one-event-per-day, boundary-triggered. `useGeofenceWatch.ts:73` `detectedThisSessionRef` guard confirmed. |
| **B5 Hash-chain daily verification cron** | ✅ GREEN | `src/app/api/cron/verify-hashes/route.ts`, scheduled `0 17 * * *` UTC (03:00 AEST) in `vercel.json`. 7 unit tests in `chain-verify.test.ts` covering all three failure modes. Live end-to-end rehearsal passed (alert row `1a97f063-7a66-44fa-9aa3-419f6fc25b44` in admin_access_log, synthetic events reverted). Resend dispatch fires on first real mismatch post-deploy. |
| **B6 Add-to-Home-Screen prompt on /field** | ✅ GREEN | `src/components/field/AddToHomeScreenPrompt.tsx`, 30-day localStorage dismiss memory, two-line copy per platform (iOS / Android-with-native-event / Android-without / Desktop Chrome+Edge), wired into `/field/home` after header. |
| **B7 Receipt polish** | ❌ RED | Not started. |

### C — Marketing / demo

| Valve | State | Evidence |
|---|---|---|
| **C1 /demo page + synthetic dataset** | ✅ GREEN | `src/app/demo/page.tsx` (public, no auth, `robots: noindex`). `src/lib/demo/bravo-dataset.ts` generates 20 workers × 4 sites × ~600 shifts with 5 edge cases injected on the most recent weekday (NO_SHOW / GPS_FAIL / DOUBLE_CLOCK / EDIT_REQUESTED / MANAGER_OVERRIDE). Amber synthetic-data banner across the top. |

### D — Legal suite

| Valve | State | Evidence |
|---|---|---|
| **D1 ABN Advice filed** | ✅ GREEN | `legal/incorporation/FLOSMOSIS_ABN_Advice_ABN_80697323925_2026-04-21.pdf` (md5 `0c9d939c…`, byte-identical copy of Desktop source). `FLOSMOSIS_ABN_Advice_LATEST.pdf` symlink. README.md updated with ABN 80 697 323 925, GST registered 21 April 2026 (quarterly BAS, PRV entity). |
| **D2 ACN/ABN/office placeholders populated** | ✅ GREEN | 22 file-level changes across `gtm/letters-ready-to-print-BRANDED/`, `legal/branded/`, `final-branded/`. No `[TO BE INSERTED ON EXECUTION]` touched. |
| **D3 Tier-1 signatory name corrections** | ✅ GREEN | Privacy Policy docx updated. Lauren Muniz Campos → Lauren Kate de Mestre (3 case variants). |
| **D4 Tier-3 framework doc name corrections** | ✅ GREEN | Seven-Gate + WLES Constitution .docx + .md — 4 files. |
| **D5 Archive superseded drafts** | ✅ GREEN | 7 files deleted from `legal/archive/superseded/`; SHA-256 manifest preserved at `legal/archive/D5-DELETION-MANIFEST-2026-04-21.md`; README.md rewritten as forwarding pointer. |
| **D6 v2.3 Founding Customer Agreement branded** | ✅ GREEN | `legal/branded/FLOSMOSIS_Founding_Customer_Agreement_v2.3_BRANDED.docx` + `.pdf`, 27 pages. |
| **D7 v2.0 IP Assignment Deed branded** | ✅ GREEN | `legal/branded/FLOS-LEG-003_IP_Assignment_Deed_v2.0_BRANDED.docx` + `.pdf`, 20 pages. |

### F — Deployment prep

| Valve | State | Evidence |
|---|---|---|
| **F1 flosmosis.com migration plan** | 🟡 YELLOW | `docs/F1-flosmosis-domain-migration.md` — 11-section executable checklist. 2 decision points flagged for Lauren. No DNS touched. |
| **F2 Resend domain verification plan** | 🟡 YELLOW | `docs/F2-resend-domain-verification.md` — 6 sections + DNS record table. 1 decision flagged. No Resend or DNS touched. |

### Legal-review code-truth (new bucket, from Day 2)

| Valve | State | Evidence |
|---|---|---|
| **Privacy A1 GPS capture window** | ✅ GREEN | `legal-review/gps-capture-truth.md`. Foreground-only, no background paths, boundary-only. Matches PP claims. |
| **Privacy A2 Selfie verification** | ✅ GREEN | `legal-review/selfie-truth.md`. **ABSENT** — no camera / biometric / vision code. If PP claims otherwise, PP is over-representing. |
| **Privacy A5 Geofence radius limits** | 🟡 YELLOW | `legal-review/geofence-limits-truth.md`. **No enforced maximum.** Default 200m; any positive integer accepted. 50–1000m range cap + admin_access_log instrumentation recommended for Day 3. |
| **ToS 2.3 Subprocessor list** | 🟡 YELLOW | `legal-review/subprocessor-truth.md`. Code calls Formspree, Google Fonts, Unsplash — **NOT in Privacy Policy §6.2**. Recommendation: either add to §6.2 or eliminate (all three avoidable). |

---

## Evidence index — commit-hash placeholders

*(No git committed yet — WOHJO `.git` in this sandbox is a placeholder
`test` HEAD. Once Lauren commits locally the hash can be inserted.)*

| Logical commit | Branch name | State |
|---|---|---|
| chore/d5-archive-delete | `chore/d5-archive-delete` | File deletions + manifest on disk |
| refactor/next16-proxy | `refactor/next16-proxy` | `src/proxy.ts` live; `middleware.ts` deleted |
| feat/a1-pino-logging | `feat/a1-pino-logging` | 34 files changed |
| feat/a2-webhook-idempotency | `feat/a2-webhook-idempotency` | Table live; Twilio wired; 4 tests green |
| test/a3-cross-tenant-scaffold | `test/a3-cross-tenant-scaffold` | 33 tests scaffolded; 29 skipped pending A3-001 decision |
| docs/a7-backup-plan + checklist | `docs/a7-backup-plan` | 2 docs on disk |
| feat/c1-demo-page | `feat/c1-demo-page` | `/demo` live; dataset module live |
| docs/f1-domain-migration + f2-resend | `docs/f1-domain-migration` | 2 docs on disk |
| docs/legal-review | `docs/legal-review` | 4 code-truth investigations on disk (P3.x) |

## Day 3 recommended order for Lauren's evening review

1. **Pick the auth-model for GAP-A3-001 / GAP-A3-002** — unblocks 21-route refactor. Options: app_metadata / admins-table / memberships / JWT claim. Doc at `tests/cross-tenant/audit-A3-001.md` §"Architectural blocker".
2. **Pick the F1 §D.2 dual-delivery decision** — 1-week or straight cutover. 1 line of code either way.
3. **Pick the F2 §D.4 sender convention** — `noreply@flosmosis.com` vs `noreply@send.flosmosis.com`.
4. **Decide on Privacy / ToS §6.2 subprocessor rewrite** — either add Formspree/Fonts/Unsplash, or eliminate them (self-host + migrate).
5. **Decide on geofence radius cap** — add 50–1000m validation server + client, add admin_access_log on site write.
6. Execute F1 + F2 DNS + Vercel cutover.
7. Execute A7 backup setup via the `docs/A7-execution-checklist.md` morning flow.
