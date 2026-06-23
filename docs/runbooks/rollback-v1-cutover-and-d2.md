# Rollback plan — WLES v1 cutover & D2 billing-schema migrations

**Work-order item #15.** What "rollback" means for two changes that are partly
**irreversible by design**, and the concrete safe action for each. The headline:
the WLES ledger is append-only, so rollback is **forward-only** — you stop new
behaviour, you never unwind sealed history.

- **Owner:** Lauren (or delegate). **Audience:** whoever is on call during/after the cutover.
- **Prod project:** `rwnxnnudljpgyfwbnosu` (ap-southeast-2).

---

## 1. WLES v1 cutover

### What the cutover is
`WLES_V1_ENABLED` gates whether new events seal under the WLES v1.0 path
(`spec_version='1.0'`, full `wles_event` blob, chained off the per-company v1
tail via a one-time `X-FLOSMOSIS-SPEC_VERSION_MIGRATION` bridge event) versus the
legacy v0 path. The eight write routes consult `isWlesV1Enabled()` per request.

### What you CAN roll back
- **New sealing only.** Set `WLES_V1_ENABLED=false`. From that moment new events
  seal under v0 again. This is the kill-switch; it is instant and needs no DDL.

### What you CANNOT roll back (and must not attempt)
- **Already-sealed v1 events.** `shift_events` is append-only: `service_role` has
  no TRUNCATE/UPDATE/DELETE, and the `shift_events_block_*` triggers enforce it
  even against the service role. Sealed v1 events (15 in prod today) **stay**.
  Deleting them would (a) be blocked, and (b) destroy legal wage evidence.
- **The bridge event.** The v0→v1 bridge is itself a sealed event; it remains.
- **The FROZEN_ANCHOR_V1 fingerprint.** It freezes the v1 prefix as canonical
  truth; it is not unwound.

### Therefore — the actual rollback procedure
1. `WLES_V1_ENABLED=false`. New events resume on v0.
2. Leave all sealed v1 data in place. Run `verify-hashes` + `substrate-health`;
   confirm `chain_integrity_*`, `chain_count_anchor`, `anchor_fingerprint`
   (V0 **and** V1), `shift_commit_completeness` all GREEN — a clean ledger across
   both spec versions is the success criterion, not an empty v1 set.
3. If a *specific* v1 event is believed wrong: it is **quarantined, not deleted** —
   append a correcting event (the documented WLES correction path), and record the
   incident. The wrong value stays in the chain (that is the point of an evidentiary
   ledger); the correction supersedes it.
4. Communicate: a mixed v0/v1 population is expected and healthy after a rollback.

### Pre-cutover gates (so you rarely need the above)
Do **not** flip `WLES_V1_ENABLED=true` for real tenants until: Tier-0 entitlement,
the C1 SMS runtime check (#7), and WLES-3 are green, and the v1 fingerprint anchor
(#5, now live) reads GREEN. Cut over **one tenant first**, watch a full pay cycle,
then widen.

---

## 2. D2 billing-schema migrations

### What D2 added
Additive, **nullable** columns on `companies`: `subscription_status`,
`trial_ends_at`, `founding_cohort_position`, `cancelled_at`,
`stripe_subscription_id`. Plus the Stripe webhook handlers that populate
`subscription_status`, and the D1 entitlement gate that reads it.

### Why a column rollback is the wrong instinct
- The columns are nullable and inert when unused. Dropping them would **lose live
  billing state** for any tenant Stripe has already written, and would break the
  webhook handlers and the entitlement gate that reference them.
- The entitlement gate **fails open on null / unknown** (`isEntitled(null) = true`,
  grandfathered) and **fails open on a read error**. So the *enforcement* is what
  you roll back, not the schema.

### Therefore — the actual rollback procedure
- **To disable billing enforcement** (the usual need): there is no single flag
  today — enforcement is the presence of `entitlementGuard()` on the two billable
  routes. Fastest safe disable without a deploy: set every real tenant's
  `subscription_status` to `NULL` (grandfathered → gate fails open). To re-enable,
  let Stripe webhooks repopulate it. *(Consider adding a `BILLING_ENFORCEMENT`
  env flag so this is a toggle, not a data edit — tracked as a follow-up.)*
- **Do NOT drop the columns.** If a column must truly go, do it only after
  confirming no tenant has non-null billing state and after removing every code
  reference — and refresh the `defaults` / table drift refs afterward.
- **Carve-out is unaffected by any rollback:** reads/exports of sealed records are
  never gated (pinned by the confinement test), so disabling enforcement never
  changes statutory-record access.

---

## 3. Rollback decision table

| Change | Reversible? | Safe rollback action | Never do |
|---|---|---|---|
| v1 new sealing | Yes | `WLES_V1_ENABLED=false` | delete sealed v1 events |
| a wrong v1 event | No (append-only) | append a correction; quarantine | UPDATE/DELETE the row |
| FROZEN_ANCHOR_V1 | No (by design) | leave it; it's the truth-freeze | rewrite the anchor row |
| D2 columns | Additive | NULL out `subscription_status` to fail-open | DROP the columns |
| D1 enforcement | Yes (effectively) | NULL subscription_status / remove guard calls | gate read/export routes |

## 4. Post-rollback verification (always)
Run `verify-hashes` + `substrate-health` and confirm every check GREEN, both spec
versions. A rollback that leaves any integrity check RED is not done — escalate.
