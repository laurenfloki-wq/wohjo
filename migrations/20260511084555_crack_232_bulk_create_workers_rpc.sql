-- CRACK 232 — bulk_create_workers RPC.
--
-- Atomically creates N workers + emits one WORKER_CREATED shift_event per
-- worker in a single transaction. Mirrors process_flostruction_export's
-- pattern (CRACK 219): now()-frozen-once + ordinal ms-offset per event
-- gives each event a unique millisecond created_at, hash-stable for the
-- TS verifier (which reads back at millisecond precision).
--
-- Each WORKER_CREATED event is genesis for that worker's chain
-- (previous_event_hash IS NULL). No cross-worker linkage; the
-- "chained sequentially" requirement from the dispatch refers to the
-- ms-offset timestamps, not to a shared chain.
--
-- Input contract:
--   p_company_id     uuid     — the calling admin's company (server-derived,
--                                never client-supplied)
--   p_admin_user_id  uuid     — auth.users.id of the calling admin (used as
--                                created_by and as the event actor)
--   p_workers        jsonb[]  — array of {employee_id, first_name, last_name,
--                                phone, myob_card_id?}. Pre-validated by the
--                                route; the RPC re-validates structurally and
--                                relies on the DB CHECK / UNIQUE constraints
--                                for collision protection.
--
-- Error codes raised (handler maps to HTTP status):
--   EMPTY_INPUT             — p_workers is null or empty       → 400
--   FORBIDDEN               — admin not member of company      → 403
--   DUPLICATE_EMPLOYEE_ID   — collision against existing or in-batch  → 409
--   DUPLICATE_PHONE         — collision against existing or in-batch  → 409
--   INVALID_PHONE_FORMAT    — phone doesn't match +XXX...      → 400
--
-- Returns one row per inserted worker.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP FUNCTION IF EXISTS public.bulk_create_workers(uuid, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.bulk_create_workers(
  p_company_id    uuid,
  p_admin_user_id uuid,
  p_workers       jsonb
) RETURNS TABLE (
  worker_id    uuid,
  employee_id  text,
  phone        text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now              timestamptz;
  v_event_created_at timestamptz;
  v_event_count      int := 0;
  v_worker_record    jsonb;
  v_new_worker_id    uuid;
  v_employee_id      text;
  v_first_name       text;
  v_last_name        text;
  v_phone            text;
  v_myob_card_id     text;
  v_emp_set          text[];
  v_phone_set        text[];
  v_event_data       jsonb;
  v_canonical_json   text;
  v_created_at_iso   text;
  v_hash_input       text;
  v_event_hash       text;
BEGIN
  -- ── 0. Input guards ────────────────────────────────────────────────
  IF p_workers IS NULL OR jsonb_typeof(p_workers) != 'array'
     OR jsonb_array_length(p_workers) = 0 THEN
    RAISE EXCEPTION 'EMPTY_INPUT: p_workers must be a non-empty jsonb array';
  END IF;

  -- ── 1. Permission check ────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.admins
    WHERE user_id = p_admin_user_id AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: user % is not an admin of company %',
      p_admin_user_id, p_company_id;
  END IF;

  -- ── 2. In-batch duplicate detection ────────────────────────────────
  -- Pulls all employee_ids and phones from p_workers; any duplicate
  -- within the batch surfaces as an error before any insert.
  v_emp_set := ARRAY(
    SELECT (w->>'employee_id')::text
    FROM jsonb_array_elements(p_workers) AS w
  );
  v_phone_set := ARRAY(
    SELECT (w->>'phone')::text
    FROM jsonb_array_elements(p_workers) AS w
  );

  IF (SELECT COUNT(*) FROM unnest(v_emp_set) GROUP BY 1 HAVING COUNT(*) > 1
      LIMIT 1) IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICATE_EMPLOYEE_ID: in-batch duplicate employee_id detected';
  END IF;
  IF (SELECT COUNT(*) FROM unnest(v_phone_set) GROUP BY 1 HAVING COUNT(*) > 1
      LIMIT 1) IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICATE_PHONE: in-batch duplicate phone detected';
  END IF;

  -- ── 3. Cross-batch duplicate detection (against existing rows) ─────
  IF EXISTS (
    SELECT 1 FROM public.workers
    WHERE company_id = p_company_id AND employee_id = ANY(v_emp_set)
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_EMPLOYEE_ID: one or more employee_ids already exist in this tenant';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.workers
    WHERE company_id = p_company_id AND phone = ANY(v_phone_set)
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_PHONE: one or more phones already exist in this tenant';
  END IF;

  -- ── 4. Freeze wall clock for the batch ─────────────────────────────
  v_now := date_trunc('milliseconds', now());

  -- ── 5. Insert workers + emit WORKER_CREATED events ─────────────────
  FOR v_worker_record IN SELECT * FROM jsonb_array_elements(p_workers)
  LOOP
    v_employee_id  := (v_worker_record->>'employee_id')::text;
    v_first_name   := (v_worker_record->>'first_name')::text;
    v_last_name    := (v_worker_record->>'last_name')::text;
    v_phone        := (v_worker_record->>'phone')::text;
    v_myob_card_id := NULLIF((v_worker_record->>'myob_card_id')::text, '');

    -- Phone format defence (mirrors workers_phone_e164_format CHECK).
    IF v_phone !~ '^\+\d{8,15}$' THEN
      RAISE EXCEPTION 'INVALID_PHONE_FORMAT: phone "%" does not match E.164', v_phone;
    END IF;

    -- 5a. INSERT worker. pay_rate stays NULL (bookkeeper-side, not in CSV).
    INSERT INTO public.workers (
      company_id,
      first_name,
      last_name,
      phone,
      employee_id,
      myob_card_id,
      is_active,
      created_at,
      updated_at
    ) VALUES (
      p_company_id,
      v_first_name,
      v_last_name,
      v_phone,
      v_employee_id,
      v_myob_card_id,
      TRUE,
      v_now,
      v_now
    )
    RETURNING id INTO v_new_worker_id;

    -- 5b. Compute event timestamp (unique-per-row ordinal offset).
    v_event_created_at := v_now + (v_event_count * interval '1 millisecond');
    v_created_at_iso := to_char(
      v_event_created_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    );

    -- 5c. Build canonical event_data (keys sorted alphabetically).
    -- Field order: created_via < employee_id < employee_name < myob_card_id < phone_e164
    v_canonical_json :=
      '{"created_via":"bulk_upload","employee_id":"' || v_employee_id ||
      '","employee_name":"' || v_first_name || ' ' || v_last_name ||
      '","myob_card_id":' || COALESCE('"' || v_myob_card_id || '"', 'null') ||
      ',"phone_e164":"' || v_phone || '"}';

    v_event_data := v_canonical_json::jsonb;

    -- 5d. Compute hash (matches TS generateEventHash() in src/lib/wles/hash.ts):
    --     SHA-256(company_id|worker_id|site_id|event_type|canonical_json|iso_ts)
    --     site_id is empty string for WORKER_CREATED (worker has no site yet).
    v_hash_input :=
      p_company_id::text || '|' ||
      v_new_worker_id::text || '|' ||
      '' || '|' ||
      'WORKER_CREATED' || '|' ||
      v_canonical_json || '|' ||
      v_created_at_iso;

    v_event_hash := encode(digest(v_hash_input::bytea, 'sha256'), 'hex');

    -- 5e. Insert the WORKER_CREATED event. Genesis for this worker's
    --     chain (previous_event_hash IS NULL).
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
      p_company_id,
      v_new_worker_id,
      NULL,
      'WORKER_CREATED',
      v_event_data,
      '{}',
      v_event_hash,
      NULL,
      '0',
      v_event_created_at,
      p_admin_user_id::text
    );

    v_event_count := v_event_count + 1;

    -- 5f. Return row.
    worker_id   := v_new_worker_id;
    employee_id := v_employee_id;
    phone       := v_phone;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bulk_create_workers(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_create_workers(uuid, uuid, jsonb) TO service_role;