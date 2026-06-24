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

## Task 2 — dashboard_drift: **LOAD-BEARING** (corrected)
Live `pg_policy` check (2026-06-24): of the 17 policies the file dropped, **only 11
are gone; 6 `*_admin_select` are still present and load-bearing** — for each of
exports/shift_events/shifts/sites/supervisors/workers, the *only* `authenticated`
read policy is that `*_admin_select` (USING `company_id IN (SELECT company_id FROM
admins WHERE user_id = auth.uid())`); the only other policy is
`service_role_full_access`. There is **no** `authenticated_select_own_company`
replacement (the original narrative was wrong). A clean replay dropping them would
strip live admin read. **Fix:** edited the committed file to drop only the verified-
gone 11 (confirmed `eleven_still_present = 0`) and retain the 6. The drift reference
already pins them (live = 46 = ref, green), so no reference change. This also fixes
a latent *attestation* drift (the rebuild previously dropped the 6 the reference
keeps).

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
harden create+forward-drop nets to 0 (= live 46); dashboard_drift now keeps the 6
the reference pins; count_broken_chain_links unchanged in effect. No prod DDL/DML
run by Claude.
