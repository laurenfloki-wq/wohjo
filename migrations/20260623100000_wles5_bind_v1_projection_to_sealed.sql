-- WLES-5 (launch-readiness audit) — bind the unhashed substrate projection to
-- the sealed wles_event at insert time.
--
-- THE GAP: shift_events.event_type / event_data / event_hash / previous_event_hash
-- are what humans, the UI, RLS, and exports actually read — but the hash only
-- protects the wles_event jsonb blob. A buggy or malicious writer could insert a
-- v1 row whose visible projection disagrees with the sealed blob (e.g. point the
-- visible record at a different shift, or carry a benign-looking event_type)
-- while the hash-chain stays perfectly green, because chain-verify walks
-- wles_event, not the projection columns.
--
-- THE FIX: a BEFORE INSERT trigger that, for v1 sealed rows ONLY, rejects any
-- insert whose projection contradicts the sealed blob. The bindings below were
-- validated against 100% of the live v1 population (every existing row passes;
-- zero would be rejected), so this can never reject a write the real writers
-- (insertV1Event / createBridgeEvent) actually produce.
--
-- WHAT IS BOUND (must agree exactly):
--   * event_hash            == wles_event.event_hash
--   * previous_event_hash   == wles_event.previous_event_hash
--   * wles_event is structurally complete (the 5 required §4 fields)
--   * event_type is a recognised PROJECTION of wles_event.event_type:
--       - identity (SHIFT_COMMIT, CLOCK_IN, X-FLOSMOSIS-…), OR
--       - extension-prefix stripped (X-FLOSMOSIS-EXPORT_RECORD → EXPORT_RECORD), OR
--       - the APPROVAL lifecycle split (APPROVAL → SUPERVISOR_APPROVAL | PAYROLL_APPROVAL)
--   * event_data.shift_id / site_id, WHEN present in both, must not point at a
--     different shift/site than the sealed payload.
--
-- WHAT IS DELIBERATELY NOT BOUND: other event_data values. event_data is a
-- non-authoritative v0-shape compat mirror (often {} or a subset) whose value
-- FORMATS legitimately differ from the WLES payload (e.g. approved_hours as a
-- string vs a number), so value-binding them would false-positive on real
-- writes. The hash binding above already guarantees the wles_event is the
-- authentic sealed payload; deriving display fields from wles_event (audit
-- option b) is the recommended long-term path for full event_data fidelity.
--
-- Scope guard: v0 rows (spec_version <> '1.0') and any row without a wles_event
-- blob pass through untouched. The trigger only READS NEW, so no elevated
-- privilege is required; it composes with the AFTER-INSERT watermark trigger
-- and the append-only UPDATE/DELETE guard (different trigger events).

CREATE OR REPLACE FUNCTION public.bind_v1_projection_to_sealed()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $func$
DECLARE
  v_wles_type text;
  v_substrate text;
BEGIN
  -- Only v1 sealed events carry a wles_event blob to bind against.
  IF NEW.spec_version IS DISTINCT FROM '1.0' OR NEW.wles_event IS NULL THEN
    RETURN NEW;
  END IF;

  -- Structural completeness of the sealed blob (WLES v1.0 §4 required fields).
  IF NOT (NEW.wles_event ? 'event_id'
          AND NEW.wles_event ? 'event_type'
          AND NEW.wles_event ? 'event_hash'
          AND NEW.wles_event ? 'previous_event_hash'
          AND NEW.wles_event ? 'payload') THEN
    RAISE EXCEPTION 'WLES-5: sealed wles_event is structurally incomplete'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Hash columns (walked by chain-verify, read by RLS/UI) must equal the sealed
  -- hash. The writer always sets these from the sealed event; a divergence means
  -- the row's visible hash lies about the sealed blob.
  IF NEW.event_hash IS DISTINCT FROM NEW.wles_event->>'event_hash' THEN
    RAISE EXCEPTION 'WLES-5: event_hash column diverges from sealed wles_event.event_hash'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.previous_event_hash IS DISTINCT FROM NEW.wles_event->>'previous_event_hash' THEN
    RAISE EXCEPTION 'WLES-5: previous_event_hash column diverges from sealed wles_event.previous_event_hash'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Substrate event_type must be a recognised projection of the sealed type.
  v_wles_type := NEW.wles_event->>'event_type';
  v_substrate := NEW.event_type;
  IF NOT (
       v_substrate = v_wles_type
       OR v_substrate = regexp_replace(v_wles_type, '^X-[A-Za-z0-9_]+-', '')
       OR (v_wles_type = 'APPROVAL' AND v_substrate IN ('SUPERVISOR_APPROVAL', 'PAYROLL_APPROVAL'))
     ) THEN
    RAISE EXCEPTION 'WLES-5: substrate event_type % is not a valid projection of sealed type %',
      v_substrate, v_wles_type
      USING ERRCODE = 'check_violation';
  END IF;

  -- Identifier fields must not point the visible record at a different shift or
  -- site than the sealed payload (when present in both — event_data may omit them).
  IF NEW.event_data ? 'shift_id'
     AND NEW.wles_event->'payload' ? 'shift_id'
     AND NEW.event_data->>'shift_id' IS DISTINCT FROM NEW.wles_event->'payload'->>'shift_id' THEN
    RAISE EXCEPTION 'WLES-5: event_data.shift_id contradicts sealed payload.shift_id'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.event_data ? 'site_id'
     AND NEW.wles_event->'payload' ? 'site_id'
     AND NEW.event_data->>'site_id' IS DISTINCT FROM NEW.wles_event->'payload'->>'site_id' THEN
    RAISE EXCEPTION 'WLES-5: event_data.site_id contradicts sealed payload.site_id'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS shift_events_bind_v1_projection ON public.shift_events;
CREATE TRIGGER shift_events_bind_v1_projection
  BEFORE INSERT ON public.shift_events
  FOR EACH ROW EXECUTE FUNCTION public.bind_v1_projection_to_sealed();
