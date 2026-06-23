# Runbook — PITR Restore Drill (WLES ledger integrity)

**Work-order item #8.** Proves that a point-in-time restore of the FLOSTRUCTION
substrate produces a database on which the hash-chained WLES ledger **re-verifies
GREEN**. For an append-only wage ledger, restore *correctness* is existential: a
restore that silently corrupts or truncates the chain makes the legal wage record
unrecoverable. This drill proves that never happens — before you need it for real.

- **Owner:** Lauren (or delegate) — **needs owner credentials; not runnable by Claude.**
- **Cadence:** monthly, and **before every major migration or the v1 cutover**.
- **Prod project:** `rwnxnnudljpgyfwbnosu` (ap-southeast-2).
- **Target time:** ~15 min hands-on + restore wait.

> **Adapted to the real substrate (2026-06-23):** the watermark column is
> `event_count` (not `high_water_mark`); the six `shift_events` triggers below are
> the actual live set; and there is **no standalone verify script yet** — the
> verifier is the cron route `src/app/api/cron/substrate-health/route.ts` (+
> `src/app/api/cron/verify-hashes/route.ts`), so verification runs by pointing a
> deployment's cron env at the target, or by writing a thin runner around
> `src/lib/wles/chain-verify-spec-aware.ts` (see step 1).

---

## Golden rule
**Never restore prod in place for a drill.** Supabase PITR rewinds the project it
runs on; doing that to prod is destructive and causes downtime. A drill restores
to a **separate, disposable target** and verifies *there*. Prod is read-only in
this procedure (a `pg_dump` source at most).

---

## Preconditions
- [ ] Supabase plan with PITR / physical backups on the prod project (Dashboard →
      Database → Backups). If PITR is not on the plan, this drill cannot validate
      true PITR semantics — use **Method B** (logical clone) to validate restore
      correctness of the chain, and flag the PITR-plan gap.
- [ ] Supabase CLI authenticated (`supabase login`); `psql` / `pg_dump` (Postgres
      17 client to match the prod engine).
- [ ] A scratch target: a new throwaway Supabase project or a Supabase **branch**
      of prod. Record its ref as `TARGET_REF`.
- [ ] The verifier reachable against the target (see step 1).

---

## Method A (preferred) — PITR restore to a NEW project
1. **Choose recovery point** `T = now − 1 hour` (or straddling the most recent
   pay-period activity). Record the exact UTC timestamp.
2. **Restore to new project** at `T` (Dashboard → Backups → Point in time →
   restore to a **new** project, or the Management API restore endpoint targeting
   a fresh project). Record `TARGET_REF` and capture **RTO** (trigger → healthy).
3. Proceed to **Integrity verification**.

## Method B (always available) — logical clone of prod
Validates the chain survives a full dump/restore round-trip (catches corruption /
ordering / encoding faults; not true PITR).
```bash
# 1. Dump prod (read-only).
PGPASSWORD=$PROD_DB_PASSWORD pg_dump \
  --host=db.rwnxnnudljpgyfwbnosu.supabase.co --port=5432 --username=postgres \
  --no-owner --no-privileges --format=custom --file=prod_snapshot.dump postgres
# 2. Restore into the disposable TARGET project.
PGPASSWORD=$TARGET_DB_PASSWORD pg_restore \
  --host=db.$TARGET_REF.supabase.co --port=5432 --username=postgres \
  --no-owner --no-privileges --clean --if-exists --dbname=postgres prod_snapshot.dump
```

---

## Integrity verification (run against `TARGET_REF`, never prod)

### 1. App-level chain verification (authoritative)
Point the verifier at the target. It recomputes JCS/SHA-256 over the real chain —
do **not** try to reproduce the canonical hash in ad-hoc SQL.

There is no standalone CLI yet; use one of:
- **(a)** Deploy/run the app with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
  pointed at `TARGET_REF` and hit `GET /api/cron/verify-hashes` then
  `GET /api/cron/substrate-health` (with the `CRON_SECRET` header), or
- **(b)** Write a thin runner that imports `verifyChainSpecAware` from
  `src/lib/wles/chain-verify-spec-aware.ts` and the count-anchor / v0-anchor
  helpers from `src/lib/wles/count-anchor.ts`, executed against the target client.

**Pass criteria — every check GREEN:**
- `chain_integrity_shift_events` and `..._ex_baseline` — linkage intact
- `anchor_fingerprint` — v0 anchor recomputes to its bound fingerprint (step 2)
- `chain_count_anchor` — live count ≥ per-company `event_count` watermark, AND the
  frozen v0 anchor matches (WLES-4 folded v0 into this check)
- `shift_commit_completeness` — no SUBMITTED/APPROVED shift missing a SHIFT_COMMIT

### 2. v0 anchor fingerprint must match exactly (deterministic)
```sql
-- Expected on a correct restore:
--   id = FROZEN_ANCHOR_V0, expected_count = 32,
--   expected_fingerprint = 8e6d4af90792eadb47f9205fe18e6325
select id, expected_count, expected_fingerprint
from substrate_anchors where id = 'FROZEN_ANCHOR_V0';

-- Live recomputation (the view executes the formula inline):
select id, expected_count, actual_count, matches
from v_anchor_verification where id = 'FROZEN_ANCHOR_V0';
-- matches MUST be true; any mismatch = FAIL, escalate immediately.
```

### 3. Structural guards survived the restore
A restore that drops the append-only triggers or re-grants TRUNCATE leaves the
ledger mutable.
```sql
-- service_role must NOT hold TRUNCATE/UPDATE/DELETE on shift_events:
select p, has_table_privilege('service_role','public.shift_events',p) as granted
from (values ('TRUNCATE'),('UPDATE'),('DELETE')) g(p);   -- all must be false

-- all six append-only + integrity triggers must be present:
select tgname from pg_trigger
where tgrelid = 'public.shift_events'::regclass and not tgisinternal
order by tgname;
-- expect EXACTLY:
--   shift_events_advance_v1_watermark
--   shift_events_bind_v1_projection
--   shift_events_block_delete
--   shift_events_block_truncate
--   shift_events_block_update
--   shift_events_validate_chain
```

### 4. Row-count and watermark sanity
```sql
-- live event count vs per-company watermark (no tail loss):
select w.company_id, w.event_count as watermark, count(se.*) as live_count
from wles_v1_watermark w
left join shift_events se
  on se.company_id = w.company_id and se.spec_version = '1.0' and se.wles_event is not null
group by w.company_id, w.event_count;     -- live_count must be >= watermark
```
Compare total `shift_events` count against prod at time `T` (within the PITR
window). A material shortfall = FAIL.

---

## Record the result
Append one row to `docs/runbooks/restore-drill-log.md`:

| Date | Method | Recovery point T | RTO | v0 fingerprint match | All checks GREEN | Notes |
|------|--------|------------------|-----|----------------------|------------------|-------|
|      | A / B  |                  |     | yes / NO             | yes / NO         |       |

Capture **RPO** (gap between `T` and the latest committed prod event) and **RTO**
(restore wall-clock) so you know your real recovery envelope, not an assumed one.

## Pass / fail
- **PASS** = every integrity check GREEN **and** the v0 fingerprint matches exactly
  **and** the six structural guards are present on the restored DB.
- **FAIL** = any mismatch, missing trigger, re-granted TRUNCATE, or count shortfall.
  Escalate to Lauren immediately; do **not** trust the prod backup until the cause
  is understood. A failed restore drill is itself a launch blocker.

## Teardown
```bash
supabase projects delete $TARGET_REF   # or delete the branch
rm -f prod_snapshot.dump
```

---
### Notes for whoever wires this into CI
- Make it a manual/scheduled workflow; a green run is a required gate before the
  v1 cutover.
- The standalone verify runner (step 1b) does not exist yet — writing it is the
  one piece of code this runbook still needs; everything else is operational.
