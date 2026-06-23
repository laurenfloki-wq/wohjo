# LAUREN-RUNBOOK — drift gate + advisor + ledger + drift-gate role

**Model:** Lauren runs every prod-mutating step; Claude prepared + verified the
SQL but did **not** run anything against prod (`rwnxnnudljpgyfwbnosu`). Run each
step in the Supabase SQL editor as `postgres`. Each step has a verification query
whose expected result is stated — do not proceed if it doesn't match.

> Order: Step 1 (policies) and Step 2 (invoker) are independent and each clears a
> DoD item. Step 3 (ledger) is hygiene (it does NOT affect the drift gate). Step 4
> (drift-gate role) is a verify-only check of PR #51's role.

---

## Step 1 — clear the drift gate (drop the two prod-only deny-all policies)

**Why:** the `Production-parity drift gate` is RED on `main`. The *actual* cause
(pulled from run 28061021442, not inferred) is the **policies** dimension only —
live prod has 48 policies vs the committed reference's 46. The two extras:

```
+ public.notification_dead_letter :: deny_all_non_service :: ALL :: public :: false :: false
+ public.wles_v1_watermark        :: deny_all_non_service :: ALL :: public :: false :: false
```

These are **prod-only drift**: no committed migration creates them, and
`20260622160000_sec5_advisor_cleanup.sql` documents that they were *intentionally
not added* — RLS is already enabled with no policy (= deny-all for
anon/authenticated) and service_role bypasses via grants, so they are
security-redundant, and an explicit policy "renders differently between the
drift-gate and attestation fingerprint queries" (breaking the pin). Dropping them
restores prod == repo with **no loss of protection**.

```sql
-- Drop the two redundant, drift-causing policies.
DROP POLICY IF EXISTS deny_all_non_service ON public.notification_dead_letter;
DROP POLICY IF EXISTS deny_all_non_service ON public.wles_v1_watermark;
```

**Verify (must hold before declaring done):**
```sql
-- (a) the two tables still deny anon/authenticated by default (RLS on, and the
--     only policies left, if any, are not permissive grants to those roles):
SELECT c.relname, c.relrowsecurity AS rls_on,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policy_count
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('notification_dead_letter','wles_v1_watermark');
-- EXPECT: rls_on = true for both; policy_count = 0 for both (deny-all by default).

-- (b) total public policy count is back to the reference (46):
SELECT count(*) FROM pg_policy p
JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public';
-- EXPECT: 46.
```

**Then:** re-run the `Production-parity drift gate` workflow on `main`
(Actions → run, or wait for the 2-hourly schedule). DoD item met when the run is
**green** — i.e. all dimensions MATCH.

---

## Step 2 — clear the advisor ERROR (re-assert security_invoker on the anchor view)

**Why:** the security advisor returns one ERROR — `security_definer_view` on
`public.v_anchor_verification` (external-facing, lint 0010). It regressed when the
v1-anchor migration recreated the view with a bare `CREATE OR REPLACE` (no `WITH`
clause), silently dropping the `security_invoker` that `m3a` had set. PR #187 adds
the re-assert migration + a guard test for the rebuild; **prod also needs the
ALTER** (prod already ran the regressing migration).

```sql
ALTER VIEW public.v_anchor_verification SET (security_invoker = true);
```

**Verify:**
```sql
-- reloptions now carries the option:
SELECT relname, reloptions
FROM pg_class WHERE relname = 'v_anchor_verification' AND relkind = 'v';
-- EXPECT: reloptions = {security_invoker=true}

-- the anchor view still recomputes GREEN for both populations (no behaviour change):
SELECT id, matches FROM public.v_anchor_verification ORDER BY id;
-- EXPECT: FROZEN_ANCHOR_V0 = true, FROZEN_ANCHOR_V1 = true
```

**Then:** re-check the security advisor (Supabase dashboard → Advisors → Security,
or `get_advisors`). DoD item met when there are **zero ERROR-level** findings.
(The remaining `auth_leaked_password_protection` is WARN-level and is the separate
dashboard toggle.)

---

## Step 3 — reconcile the migration ledger (hygiene; does NOT affect the drift gate)

**Why:** committed migration filenames and prod's `supabase_migrations.schema_migrations`
diverged — migrations applied via `apply_migration` were recorded under
auto-generated version strings (e.g. `wles_a1` recorded as `20260623025032`, not
the committed `20260623160000`), and the prod ledger tops out around
`20260623032320` while committed files go to `20260623190000`. The *schema* is
correct (effects applied); only the ledger version strings differ. This does **not**
trip the drift gate (which reads live catalogs, not the ledger) — but it will
confuse future `supabase db push`/migration tooling, so reconcile it.

Because Claude cannot read prod, this step is **diagnose-then-reconcile**:

```sql
-- 3a. DUMP the current ledger (send the output back so the exact reconcile SQL
--     can be generated):
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
```

Reconcile pattern (the exact statements depend on 3a's output): for each committed
migration filename `<ts>_<name>.sql` whose effect is present in prod but whose
`version` is recorded under a different string, align the ledger row:

```sql
-- Example shape — DO NOT run until 3a is mapped to committed filenames:
-- UPDATE supabase_migrations.schema_migrations SET version = '20260623160000'
--   WHERE version = '20260623025032';   -- wles_a1
-- INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20260623190000','reassert_v_anchor_verification_security_invoker')
--   ON CONFLICT (version) DO NOTHING;    -- after PR #187 + Step 2 are applied
```

**Verify:** `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;`
should list the committed filename versions (…180000, 190000) once reconciled.

---

## Step 4 — verify the drift-gate role (PR #51) can read its fingerprints

**Why:** PR #51's `scripts/.116c/drift-gate-role.sql` provisions `drift_gate_ro`
with `CONNECT` + `USAGE` and **no SELECT** on any table/view. Analysis: every
drift-gate query reads system catalogs (`pg_class`, `pg_policy`, `pg_proc`,
`pg_trigger`, `pg_index`, `pg_attrdef`, `pg_extension`, `pg_type`) and the
`pg_get_*def` functions, which reconstruct definitions from catalog OIDs and do
**not** check ACLs on the target — so no SELECT is required, including for
`view_body`/`pg_get_viewdef`. (The `drift-gate.mjs` comment claiming view_body
"needs SELECT on the view" is over-cautious and is contradicted by the live gate
already producing `view_body MATCH`.) **Conclusion: the role grants are sufficient
as written — no correction needed.** Confirm empirically:

```sql
-- Run AS the gate role to prove every dimension is readable with no SELECT grants.
SET ROLE drift_gate_ro;
SELECT pg_get_viewdef('public.v_anchor_verification'::regclass, true) IS NOT NULL AS view_body_ok;       -- EXPECT true
SELECT count(*) > 0 AS policies_ok   FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid;                 -- EXPECT true
SELECT count(*) > 0 AS functions_ok  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'; -- EXPECT true
SELECT count(*) > 0 AS triggers_ok   FROM pg_trigger t WHERE NOT t.tgisinternal;                          -- EXPECT true
SELECT pg_get_indexdef((SELECT indexrelid FROM pg_index LIMIT 1)) IS NOT NULL AS indexes_ok;              -- EXPECT true
RESET ROLE;
```

If any returns false / errors (it should not), grant the minimal fix —
`GRANT SELECT ON public.v_anchor_verification, public.v_security_advisor_sweep, public.v_shift_commit_orphans TO drift_gate_ro;`
— and re-run. **Expectation: no correction needed.**

---

## Handback summary
- Step 1: drop 2 policies → re-run drift gate → expect GREEN.
- Step 2: ALTER VIEW invoker → re-check advisor → expect ZERO error-level.
- Step 3: dump ledger (3a) → send back → reconcile.
- Step 4: SET ROLE self-check → expect all true (no grant change).
- Merge PR #187 (rebuild guard + re-assert migration) only after CI green + your go-ahead.
