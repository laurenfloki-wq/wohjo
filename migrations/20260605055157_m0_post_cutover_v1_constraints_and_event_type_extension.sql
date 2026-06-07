-- M0 — Phase 0 substrate guard, three-part. Per the approved corrected
-- proposal + the optional hardening accepted in the M0 decision.
--
-- (1) PRIMARY FIX — post-cutover v0 is impossible at the substrate.
--     Added NOT VALID so the existing two anomaly rows
--     (d6249c3a, e22ee9fd, both spec='0' / created_at 2026-06-05)
--     are NOT scanned and remain forensically present. The
--     constraint enforces on every future INSERT and UPDATE; the
--     latter means any attempt to mutate either of those two rows
--     also fails — append-only is enforced by both convention and
--     substrate from this migration forward.
--     VALIDATE CONSTRAINT must never be run on this constraint.
--
-- (2) HARDENING — unsealed v1 is impossible at the substrate.
--     spec_version='1.0' rows MUST carry the wles_event jsonb.
--     The sole existing v1 row (the bridge ec801f17…) already
--     satisfies this, so this one is added as VALID.
--
-- (3) UNBLOCKING FOR M1 — extend the event_type CHECK enum to
--     include the X-FLOSMOSIS-* WLES extension types that M1's
--     routes will emit. Without this, the v1 sealing paths for
--     PAYROLL_APPROVAL, SUPERVISOR_APPROVAL, CORRECTION,
--     BUG_CORRECTION, EXPORT_RECORD, DISPUTE_RAISED,
--     WORKER_DISPUTE_FILED, and SPEC_VERSION_ANOMALY would write
--     wles_event.event_type 'X-FLOSMOSIS-…' into the event_type
--     column and the existing enum would reject them.
--     The existing legacy names (PAYROLL_APPROVAL, EXPORT_RECORD,
--     etc.) are kept in the enum — they describe the 32 pre-cutover
--     v0 rows and the 2 anomaly rows. Adding to a CHECK enum keeps
--     every existing row valid.

-- (1)
ALTER TABLE public.shift_events
  ADD CONSTRAINT shift_events_post_cutover_spec_v1
  CHECK (
    NOT (created_at >= TIMESTAMPTZ '2026-06-04T02:56:50Z' AND spec_version = '0')
  ) NOT VALID;

COMMENT ON CONSTRAINT shift_events_post_cutover_spec_v1 ON public.shift_events IS
  'Per WLES cutover 2026-06-04T02:56:50Z: every row created at or after the cutover MUST be spec_version=''1.0''. Added NOT VALID so the two pre-existing anomaly rows (d6249c3a PAYROLL_APPROVAL 2026-06-05 04:18:52Z; e22ee9fd EXPORT_RECORD 2026-06-05 04:19:10Z) are preserved unmutated. DO NOT RUN VALIDATE CONSTRAINT — those anomalies are explained by the X-FLOSMOSIS-SPEC_VERSION_ANOMALY annotation event minted in M2 (payload-level attestation, not chain repair).';

-- (2)
ALTER TABLE public.shift_events
  ADD CONSTRAINT shift_events_v1_sealed
  CHECK (spec_version <> '1.0' OR wles_event IS NOT NULL);

COMMENT ON CONSTRAINT shift_events_v1_sealed ON public.shift_events IS
  'WLES v1.0 events must carry the sealed canonical event in wles_event jsonb. Added VALID — the sole existing v1.0 row (the bridge ec801f17…) satisfies this. Preventive guard against an unsealed-v1 class of bug rather than relying on detection by the daily substrate-health check.';

-- (3)
ALTER TABLE public.shift_events DROP CONSTRAINT IF EXISTS shift_events_event_type_check;
ALTER TABLE public.shift_events
  ADD CONSTRAINT shift_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    -- Legacy substrate names (pre-cutover v0 rows + anomaly rows)
    'START_EVENT'::text,
    'END_EVENT'::text,
    'SHIFT_COMMIT'::text,
    'SUPERVISOR_APPROVAL'::text,
    'PAYROLL_APPROVAL'::text,
    'INTELLIGENCE_CLEAR'::text,
    'ANOMALY_FLAG'::text,
    'DISPUTE_RAISED'::text,
    'EXPORT_RECORD'::text,
    'CORRECTION'::text,
    'BUG_CORRECTION'::text,
    'SUPERVISOR_RE_APPROVAL'::text,
    'WORKER_DISPUTE_FILED'::text,
    'WORKER_CREATED'::text,
    -- WLES X-FLOSMOSIS-* extension types for v1.0 sealed events
    'X-FLOSMOSIS-SPEC_VERSION_MIGRATION'::text,
    'X-FLOSMOSIS-SPEC_VERSION_ANOMALY'::text,
    'X-FLOSMOSIS-EXPORT_RECORD'::text,
    'X-FLOSMOSIS-DISPUTE_RAISED'::text,
    'X-FLOSMOSIS-PAYROLL_APPROVAL'::text,
    'X-FLOSMOSIS-SUPERVISOR_APPROVAL'::text,
    'X-FLOSMOSIS-CORRECTION'::text,
    'X-FLOSMOSIS-BUG_CORRECTION'::text,
    'X-FLOSMOSIS-WORKER_DISPUTE_FILED'::text
  ]));