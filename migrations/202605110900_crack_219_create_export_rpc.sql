-- CRACK 219 WS1 — process_flostruction_export PL/pgSQL RPC
-- 2026-05-11 · Monday AM dispatch (CRITICAL — P0 substrate fix)
--
-- Root cause this fixes:
--
--   Bug #1 (non-atomic handler):
--     The TypeScript /api/exports/myob route performed ~8 separate
--     PostgREST round-trips (INSERT exports, UPDATE shifts, INSERT events
--     per shift). On failure mid-way, the compensating rollback attempted
--     UPDATE shifts SET status = 'PAYROLL_APPROVED' — but the
--     enforce_shift_status_transitions trigger is forward-only: EXPORTED
--     is a terminal state and the trigger blocks the reverse transition.
--     The compensating rollback silently failed, leaving shifts in EXPORTED
--     with no EXPORT_RECORD events and an orphaned exports row.
--
--   Bug #2 (in-batch chain rollover):
--     For a multi-shift batch, all shifts for the same worker were given
--     the SAME previous_event_hash (the pre-batch chain head), because the
--     TypeScript route read the chain head ONCE per worker before the loop.
--     Inside the loop, the chain-validation trigger (which fires per-row)
--     rejected shifts 2..N for a given worker because their
--     previous_event_hash pointed to an event that was no longer the tail.
--
-- Fix:
--   A single PL/pgSQL RPC that wraps everything in one transaction.
--   Events are inserted sequentially, with the chain head re-read from a
--   temp table that is updated after each insertion — guaranteeing that
--   each event's previous_event_hash always points to the ACTUAL tail at
--   insert time.
--
-- Hash function replication:
--   generateEventHash() in src/lib/wles/hash.ts computes:
--     SHA-256(company_id|worker_id|site_id|event_type|canonical_json|iso_ts)
--   where canonical_json is canonicalStringify(event_data) — keys sorted
--   alphabetically, no spaces. JSONB::text in PostgreSQL adds spaces, so
--   this RPC constructs the canonical JSON string directly from known-safe
--   field values (UUIDs, hex strings, the literal "myob"). pgcrypto's
--   digest() computes the matching SHA-256.
--
--   created_at is truncated to millisecond precision so that
--   new Date(stored_ts).toISOString() in the TypeScript verifier produces
--   the same string that was used to compute the hash here.
--
-- Signature extended from dispatch spec to include p_file_hash:
--   The CSV is generated in TypeScript (MYOBExporter). This RPC receives
--   the pre-computed SHA-256 file_hash and records it in both the exports
--   row and each EXPORT_RECORD event_data.
--
-- DO NOT auto-apply. Lauren applies via Supabase SQL Editor against
-- rwnxnnudljpgyfwbnosu, then runs the E2E smoke test (FSTR-KMQ6479Q,
-- FSTR-UVD4DZ9N, FSTR-J42SACCX — PAYROLL_APPROVED after manual repair)
-- before WS3 (handler rewrite) goes live.
--
-- Joao E2E test sacred zone: untouched. The function is invoked only by
-- the export handler; existing rows and chains are never touched.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP FUNCTION IF EXISTS public.process_flostruction_export(uuid, uuid, uuid[], text);

-- ─── process_flostruction_export ──────────────────────────────────────────────
--
-- Atomically exports a batch of PAYROLL_APPROVED shifts:
--   1. Permission check — p_admin_user_id must be in admins for p_company_id
--   2. Shift validation — all p_shift_ids must be PAYROLL_APPROVED + no export_id
--   3. Compute pay-period bounds + total hours from shifts table
--   4. INSERT exports row
--   5. FOR UPDATE lock on each shift + advisory lock on each worker's chain +
--      UPDATE shifts SET status = 'EXPORTED'
--   6. INSERT EXPORT_RECORD shift_events sequentially; for each event re-read
--      the chain head from a temp table that reflects all insertions made so
--      far in this transaction (fixes Bug #2)
--
-- Returns one row: export_id, exported_shifts (uuid[]), event_count,
-- export_record_event_ids (uuid[]).
--
-- Raises:
--   'FORBIDDEN'        — p_admin_user_id is not an admin of p_company_id
--   'INVALID_SHIFTS'   — one or more shift_ids not found / not PAYROLL_APPROVED /
--                        already have an export_id
--   'RACE_CONDITION'   — a shift changed status between validation and lock
--   'EMPTY_INPUT'      — p_shift_ids is empty or null
--
-- Security: SECURITY DEFINER. Only service_role may EXECUTE.

CREATE OR REPLACE FUNCTION public.process_flostruction_export(
  p_company_id    uuid,
  p_admin_user_id uuid,
  p_shift_ids     uuid[],
  p_file_hash     text
) RETURNS TABLE (
  export_id               uuid,
  exported_shifts         uuid[],
  event_count             int,
  export_record_event_ids uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now               timestamptz;
  v_export_id         uuid;
  v_shift             record;
  v_event_id          uuid;
  v_prior_event_id    uuid;
  v_prior_event_hash  text;
  v_event_hash        text;
  v_hash_input        text;
  v_canonical_json    text;
  v_created_at_iso    text;
  v_event_created_at  timestamptz;
  v_pay_period_start  date;
  v_pay_period_end    date;
  v_total_hours       numeric;
  v_event_ids         uuid[]  := ARRAY[]::uuid[];
  v_shift_array       uuid[]  := ARRAY[]::uuid[];
  v_event_count       int     := 0;
BEGIN
  -- ── 0. Input guards ─────────────────────────────────────────────────────────

  IF p_shift_ids IS NULL OR array_length(p_shift_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'EMPTY_INPUT: p_shift_ids must be a non-empty array';
  END IF;

  -- ── 1. Permission check ──────────────────────────────────────────────────────

  IF NOT EXISTS (
    SELECT 1 FROM public.admins
    WHERE user_id = p_admin_user_id
      AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: user % is not an admin of company %',
      p_admin_user_id, p_company_id;
  END IF;

  -- ── 2. Shift validation ──────────────────────────────────────────────────────
  --      Every shift must: exist in this company, be PAYROLL_APPROVED,
  --      and have no prior export_id.

  IF EXISTS (
    SELECT 1 FROM unnest(p_shift_ids) AS req(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.shifts s
      WHERE s.id        = req.id
        AND s.company_id = p_company_id
        AND s.status     = 'PAYROLL_APPROVED'
        AND s.export_id  IS NULL
    )
  ) THEN
    RAISE EXCEPTION
      'INVALID_SHIFTS: one or more shift_ids not found, not PAYROLL_APPROVED, or already exported';
  END IF;

  -- ── 3. Derive pay-period bounds + total hours ─────────────────────────────────

  SELECT
    MIN(shift_date),
    MAX(shift_date),
    SUM(total_hours)
  INTO v_pay_period_start, v_pay_period_end, v_total_hours
  FROM public.shifts
  WHERE id = ANY(p_shift_ids);

  -- ── 4. INSERT exports row ─────────────────────────────────────────────────────
  --      Freeze the wall-clock timestamp to millisecond precision for
  --      hash stability (see "Hash function replication" header comment).

  v_now := date_trunc('milliseconds', now());

  INSERT INTO public.exports (
    company_id,
    pay_period_start,
    pay_period_end,
    export_target,
    shift_ids,
    total_shifts,
    total_hours,
    file_hash,
    exported_by,
    exported_at
  ) VALUES (
    p_company_id,
    v_pay_period_start,
    v_pay_period_end,
    'myob',
    p_shift_ids,
    array_length(p_shift_ids, 1),
    v_total_hours,
    p_file_hash,
    p_admin_user_id,
    v_now
  )
  RETURNING id INTO v_export_id;

  -- ── 5. Lock shifts + advisory-lock chains + UPDATE shifts to EXPORTED ─────────
  --      ORDER BY worker_id, id → deterministic lock order to prevent deadlocks
  --      when concurrent exports overlap on different shifts for the same workers.

  FOR v_shift IN
    SELECT s.id, s.worker_id, s.site_id, s.company_id, s.receipt_id
    FROM   public.shifts s
    WHERE  s.id = ANY(p_shift_ids)
    ORDER BY s.worker_id, s.id
    FOR UPDATE
  LOOP
    -- Advisory lock serialises concurrent writes to this worker's event chain.
    PERFORM pg_advisory_xact_lock(hashtext('flos.chain.' || v_shift.worker_id::text)::bigint);

    UPDATE public.shifts
    SET    status     = 'EXPORTED',
           export_id  = v_export_id,
           updated_at = v_now
    WHERE  id = v_shift.id
      AND  status = 'PAYROLL_APPROVED';

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'RACE_CONDITION: shift % changed status between validation and lock',
        v_shift.id;
    END IF;

    v_shift_array := array_append(v_shift_array, v_shift.id);
  END LOOP;

  -- ── 5a. Build per-worker chain-head state table ───────────────────────────────
  --       Populated once before the event-insert loop.  Each INSERT below
  --       updates this table so that subsequent shifts for the same worker
  --       chain off the event just inserted, not the pre-batch head (Bug #2 fix).

  CREATE TEMP TABLE _export_chain_heads (
    worker_id         uuid PRIMARY KEY,
    last_event_id     uuid,
    last_event_hash   text
  ) ON COMMIT DROP;

  -- Workers that already have events: take the most recent.
  INSERT INTO _export_chain_heads (worker_id, last_event_id, last_event_hash)
  SELECT DISTINCT ON (se.worker_id)
    se.worker_id,
    se.id,
    se.event_hash
  FROM   public.shift_events se
  WHERE  se.worker_id = ANY(
    SELECT DISTINCT worker_id FROM public.shifts WHERE id = ANY(p_shift_ids)
  )
  ORDER BY se.worker_id, se.created_at DESC, se.id DESC;

  -- Workers with no prior events: seed with NULLs.
  INSERT INTO _export_chain_heads (worker_id, last_event_id, last_event_hash)
  SELECT DISTINCT s.worker_id, NULL, NULL
  FROM   public.shifts s
  WHERE  s.id = ANY(p_shift_ids)
  ON CONFLICT (worker_id) DO NOTHING;

  -- ── 6. INSERT EXPORT_RECORD events ────────────────────────────────────────────
  --       Same deterministic order as step 5.  Each iteration:
  --         a) reads chain head from _export_chain_heads (reflects prior inserts)
  --         b) builds canonical JSON string for the hash input
  --         c) computes SHA-256 via pgcrypto
  --         d) inserts the event
  --         e) updates _export_chain_heads so the next shift for this worker
  --            chains correctly

  FOR v_shift IN
    SELECT s.id, s.worker_id, s.site_id, s.company_id, s.receipt_id
    FROM   public.shifts s
    WHERE  s.id = ANY(p_shift_ids)
    ORDER BY s.worker_id, s.id
  LOOP
    -- (a) Chain head for this worker
    SELECT last_event_id, last_event_hash
    INTO   v_prior_event_id, v_prior_event_hash
    FROM   _export_chain_heads
    WHERE  worker_id = v_shift.worker_id;

    -- (b) Timestamp for this event: v_now + ordinal offset keeps each event
    --     in the batch at a unique millisecond so ORDER BY created_at ASC
    --     produces the correct chain order for the TypeScript verifier.
    v_event_created_at := v_now + (v_event_count * interval '1 millisecond');
    v_created_at_iso   := to_char(
      v_event_created_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    );

    -- (c) Canonical event_data JSON (keys sorted alphabetically, no spaces).
    --     Field order: export_id < file_hash < provider < receipt_id < shift_id
    --     All values are UUID/hex/receipt strings — no JSON-special chars.
    v_canonical_json :=
      '{"export_id":"' || v_export_id::text ||
      '","file_hash":"' || p_file_hash ||
      '","provider":"myob","receipt_id":"' || v_shift.receipt_id ||
      '","shift_id":"' || v_shift.id::text || '"}';

    -- (d) Compute SHA-256 matching generateEventHash() in src/lib/wles/hash.ts:
    --       SHA-256(company_id|worker_id|site_id|event_type|canonical_json|iso_ts)
    v_hash_input :=
      coalesce(v_shift.company_id, p_company_id)::text || '|' ||
      v_shift.worker_id::text                          || '|' ||
      coalesce(v_shift.site_id::text, '')              || '|' ||
      'EXPORT_RECORD'                                  || '|' ||
      v_canonical_json                                 || '|' ||
      v_created_at_iso;

    v_event_hash := encode(digest(v_hash_input::bytea, 'sha256'), 'hex');

    -- (e) Insert event.
    --     parent_shift_event_id intentionally omitted (NULL) — the
    --     shift_events_correction_consistency_check constraint requires
    --     it to be NULL for non-corrective event types like EXPORT_RECORD.
    INSERT INTO public.shift_events (
      company_id,
      worker_id,
      site_id,
      event_type,
      event_data,
      device_metadata,
      event_hash,
      previous_event_hash,
      spec_version,
      created_at,
      created_by
    ) VALUES (
      coalesce(v_shift.company_id, p_company_id),
      v_shift.worker_id,
      v_shift.site_id,
      'EXPORT_RECORD',
      v_canonical_json::jsonb,
      '{}',
      v_event_hash,
      v_prior_event_hash,
      '0',
      v_event_created_at,
      p_admin_user_id::text
    )
    RETURNING id INTO v_event_id;

    -- (f) Advance chain head for this worker.
    UPDATE _export_chain_heads
    SET    last_event_id   = v_event_id,
           last_event_hash = v_event_hash
    WHERE  worker_id = v_shift.worker_id;

    v_event_ids   := array_append(v_event_ids, v_event_id);
    v_event_count := v_event_count + 1;
  END LOOP;

  -- Return summary to caller
  RETURN QUERY
  SELECT v_export_id, v_shift_array, v_event_count, v_event_ids;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_flostruction_export(uuid, uuid, uuid[], text)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.process_flostruction_export(uuid, uuid, uuid[], text)
  TO service_role;

COMMIT;

-- ── Post-apply verification ───────────────────────────────────────────────────
--
-- Confirm function exists and service_role has EXECUTE:
--   SELECT routine_name, routine_type
--   FROM information_schema.routines
--   WHERE routine_schema = 'public'
--     AND routine_name = 'process_flostruction_export';
--
-- Dry-run with the 3 repaired PAYROLL_APPROVED shifts
-- (substitute real values from Supabase):
--   SELECT * FROM public.process_flostruction_export(
--     '<company_id>',
--     '<admin_user_id>',
--     ARRAY['<shift_id_1>', '<shift_id_2>', '<shift_id_3>']::uuid[],
--     'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
--   );
--
-- After WS3 handler rewrite goes live, run the full E2E smoke test
-- described in WS6.
