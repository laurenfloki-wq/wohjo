# Ledger reconcile — findings (repo-side, verify-first)

Every claim checked against live prod with read-only SELECTs; no prod mutation by
Claude. Bodies pulled from `supabase_migrations.schema_migrations.statements`
(authoritative) and `pg_get_functiondef` / `pg_policy`.

## Task 1 — widen_shift_events_event_type_check_for_wles_v1 (prod-only)
Pulled the exact body from the prod ledger (version `20260615080918`) and committed
it verbatim as `migrations/20260615080918_*.sql`. Idempotent DROP+ADD that widens
`shift_events_event_type_check` to a strict superset (adds CLOCK_IN/OUT/BREAK_*/
APPROVAL). Already in the prod ledger → **no insert needed**; clean replay now
reproduces prod. CHECK constraints aren't drift-tracked, so no drift impact.

## Task 2 — dashboard_drift: original retained (interim "load-bearing" edit reverted)
An initial pass edited this file to drop only 11 of 17 policies and **retain 6
`*_admin_select`**, on the theory that a clean replay dropping them would strip admin
read. **That edit was wrong and has been reverted to the `main` version verbatim.**
Verification (live prod + CI, 2026-06-24):
- The 6 policies the original drops are the **legacy `current_user_company_id()`-based**
  definitions. Prod has **no** `current_user_company_id()` function; its working
  `*_admin_select` policies use the admins-subquery form (`company_id IN (SELECT
  a.company_id FROM admins a WHERE a.user_id = auth.uid())`), recreated **downstream**
  of this migration — so the original does **not** strip admin read.
- Retaining the legacy 6 made the clean rebuild resurrect `current_user_company_id()`
  and diverge from the pinned reference and prod: **Real-PG full-graph attestation** and
  **Cross-tenant RLS probe** both went red (12 probe failures, all `permission denied
  for function current_user_company_id`), while `main` (original) is green and its probe
  asserts admin read works.
**Fix:** reverted to `main` verbatim (drops all 17 legacy policies + the orphan
`current_user_company_id()`). Clean replay reproduces prod; all gates green.

## Task 3 — harden_rls_deny_all_internal_tables (prod-only)
Pulled the exact body (version `20260623012112`); committed it as-is
(`migrations/20260623012112_*.sql`). Added a **forward-drop** migration
(`20260623013000_drop_deny_all_internal_tables.sql`) capturing the prod drop that
greened the drift gate, so an empty-DB replay nets to current state (create →
drop → 0 policies on both tables = live 46 = ref). harden_rls is already in the
ledger; the forward-drop is **new → needs a record-only ledger insert** (Task 5).

## Task 4 — count_broken_chain_links: equivalent (stale comment)
Prod `pg_get_functiondef` (md5 `1b00b2fc…`) is **byte-identical** to the committed
`CREATE OR REPLACE` (`LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'`,
same body). The committed file's comment claimed `444ac463…`, which is **stale** —
the real md5 of both prod and the committed body is `1b00b2fc…` (consistent with
the green functions drift dimension). **Fix:** corrected the comment; bodies are
equivalent → **record-only ledger insert** (Task 5), no DDL change.

## Task 5 — ledger completeness
Diffed all committed migration versions against the full prod ledger. Genuinely-
missing **recent** rows: `20260608000000` (dashboard_drift), `20260609000000`
(count_broken_chain_links), `20260623013000` (harden_rls forward-drop). widen +
harden_rls are already recorded (no-op). Single reviewed record-only INSERT in
**LAUREN-RUNBOOK-LEDGER-2026-06-24.md** (ON CONFLICT DO NOTHING; re-executes no
schema SQL).
**Additional finding (flagged, not bundled):** 16 early Apr–May migrations
predate the ledger (earliest row `20260506090427`) and an unversioned
`A2-webhook-idempotency.sql` — a separate backfill/rename decision for Lauren.

---

## Handback to Lauren
1. Review + run the record-only INSERT (LAUREN-RUNBOOK-LEDGER) → ledger gains the
   3 recent rows; verify the 5 versions present; confirm schema unchanged.
2. Decide on the **pre-existing gap** (16 early migrations + the unversioned file)
   — separate backfill PR if you want full ledger completeness.
3. Go-ahead to merge this repo-side PR (5 migration files touched/created + 2 docs)
   once CI is green — not merged without your word.

## Invariant held
prod == pinned reference == clean-replay throughout: widen/CHECK not drift-tracked;
harden create+forward-drop nets to 0 (= live 46); dashboard_drift restored to the original (drops 17 legacy policies + the orphan function; downstream migrations recreate prod's admins-subquery policies); count_broken_chain_links unchanged in effect. No prod DDL/DML
run by Claude.
