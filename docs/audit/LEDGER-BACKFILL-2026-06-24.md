# LEDGER-BACKFILL — pre-existing gap (early migrations + A2 rename)

Verified with read-only SELECTs against prod; this records **bookkeeping rows only**
and re-executes no schema SQL. The production-parity drift gate is green, which is the
proof that every committed migration already rebuilds to the live prod schema — so
recording these as applied is faithful, not speculative.

## Diff (2026-06-24): 115 committed files vs 97 ledger rows
18 committed migrations had **no** ledger row; **0** orphan ledger rows. All 18 are
backfilled (record-only), with `statements` set to each migration's verbatim committed
body and `ON CONFLICT (version) DO NOTHING`:

| version | name | note |
|---|---|---|
| `202604220900` | `create_admins_table` | early 12-digit (predates ledger) |
| `202604220905` | `workers_user_id` | early 12-digit (predates ledger) |
| `202604221500` | `shifts_status_in_progress` | early 12-digit (predates ledger) |
| `202604221510` | `workers_primary_site_id` | early 12-digit (predates ledger) |
| `202604252100` | `worker_mfa_challenges` | early 12-digit (predates ledger) |
| `202604252200` | `worker_signin_anomaly` | early 12-digit (predates ledger) |
| `202604262108` | `a2_webhook_idempotency` | A2 -> renamed (2026-04-26 authorship; leaf, replay-safe) |
| `202604280930` | `shift_events_wles_v1` | early 12-digit (predates ledger) |
| `202604302100` | `rls_core_multi_tenant` | early 12-digit (predates ledger) |
| `202605010945` | `supervisors_add_created_at` | early 12-digit (predates ledger) |
| `202605011000` | `dispute_correction_phase1` | early 12-digit (predates ledger) |
| `202605011505` | `joao_row_canonical_hash` | early 12-digit (predates ledger) |
| `202605020900` | `atomic_provision_tenant` | early 12-digit (predates ledger) |
| `202605020920` | `atomic_founding_spot` | early 12-digit (predates ledger) |
| `202605020940` | `end_event_idempotency` | early 12-digit (predates ledger) |
| `202605051500` | `tenant_activity_mappings` | early 12-digit (predates ledger) |
| `202605090000` | `auth_events_substrate` | early 12-digit (predates ledger) |
| `20260623190000` | `reassert_v_anchor_verification_security_invoker` | #187 security_invoker re-assert (effect in prod; row was missing) |

## A2 rename
`A2-webhook-idempotency.sql` was the only unversioned file, so it could not map to a
ledger version. Renamed to `202604262108_a2_webhook_idempotency.sql` (its 2026-04-26
authorship from the initial commit). It creates the self-contained `webhook_idempotency`
table (+2 indexes, service-role RLS) — a leaf with no foreign keys and no consumers, so
its replay position does not change the rebuilt schema. The drift gate and full-graph
attestation on this PR are the confirmation.

## Method (prod, record-only)
A single `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)`
covering the 18 versions above, each body taken verbatim from the committed file,
`ON CONFLICT (version) DO NOTHING`. Run as `postgres` once this PR merges (so A2's file
exists at the recorded version `202604262108`).

## Verify (after running)
- `SELECT count(*) FROM supabase_migrations.schema_migrations;` expect 97 → 115.
- File-vs-ledger diff returns 0 missing.
- Drift gate stays green; no `public` schema object changed (the INSERT stores text as
  data and executes nothing).
