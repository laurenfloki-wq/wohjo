# Archived pre-baseline migrations

These five migrations were never applied to production. They predate the
`supabase_migrations.schema_migrations` baseline at `20260506090427` and
represent intent that was overridden, rolled back, or superseded before
discipline began. Keeping them in `/migrations/` would break the
empty-replay chain — each one conflicts with the post-baseline byte-faithful
truth in a different way:

- `202604220910_geofence_radius_cap.sql` — adds a `sites.geofence_radius_bounded`
  CHECK that production does not have. Production rolled back or never
  applied.
- `202604250930_onboarding_company_fields.sql` — adds 6 `companies` columns
  (founding*cohort_position, signing_authority*\*, signup_completed_at,
  trial_ends_at, accepted_terms_version) that production does not have.
  Production rolled back or never applied.
- `202604251200_singleton_event_unique_constraints.sql` — creates a UNIQUE
  partial index on `shift_events(shift_id) WHERE event_type='SUPERVISOR_APPROVAL'`
  that would have rejected the 6 historical duplicates production had at
  baseline time. Never applied; phase_2 (20260507034128) tags those
  duplicates and then creates the index with the historical-duplicate
  exclusion.
- `202604252300_supervisor_batch_sent_at.sql` — adds `supervisors.last_batch_sms_sent_at`.
  Production's column came from the RENAME COLUMN in deploy_wave_2026_05_06
  (20260506235110), not this ADD COLUMN. Never applied.
- `202604301700_atomic_sms_idempotency.sql` — creates
  `append_sms_code_if_absent(uuid, text, date, timestamptz)`. chat-Claude
  attested live production has 11 functions in `public`, none of which
  is this one. The function pattern was superseded by application-layer
  logic in `src/lib/sms/late-trigger.ts`; the function was never carried
  forward into production. Surfaced 2026-06-08 during functions-count
  drift hunt (rebuild 12 vs prod 11). Comment-only reference in
  `202605020940_end_event_idempotency.sql` (line 55) is documentary,
  not a dependency.

Preserved as evidentiary history for what was tried during pre-discipline
dashboard era. Not in the replay chain. The replay loop reads
`migrations/*.sql` only (not `migrations/archive/`).
