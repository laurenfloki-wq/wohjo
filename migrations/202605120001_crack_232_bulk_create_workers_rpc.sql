-- CRACK 232 — bulk_create_workers RPC.
-- APPLIED 2026-05-11 PM via Supabase MCP. This file is the
-- code-side record. Final shipped revision: v4 with search_path
-- including `extensions` so pgcrypto's digest() resolves under
-- SECURITY DEFINER.
--
-- Atomically creates N workers + emits one WORKER_CREATED shift_event
-- per worker in a single transaction. Mirrors process_flostruction_export
-- (CRACK 219): now()-frozen-once + ordinal ms-offset per event yields
-- unique millisecond created_at values that match the TS verifier's
-- millisecond-precision toISOString() roundtrip.
--
-- Each WORKER_CREATED is genesis for that worker's chain
-- (previous_event_hash IS NULL). "Chained sequentially" from the
-- dispatch refers to the ms-offset timestamps, not a shared chain.

DROP FUNCTION IF EXISTS public.bulk_create_workers(uuid, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.bulk_create_workers(
  p_company_id    uuid,
  p_admin_user_id uuid,
  p_workers       jsonb
) RETURNS TABLE (
  out_worker_id    uuid,
  out_employee_id  text,
  out_phone        text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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
  v_emp_distinct     int;
  v_phone_distinct   int;
  v_event_data       jsonb;
  v_canonical_json   text;
  v_created_at_iso   text;
  v_hash_input       text;
  v_event_hash       text;
BEGIN
  IF p_workers IS NULL OR jsonb_typeof(p_workers) != 'array'
     OR jsonb_array_length(p_workers) = 0 THEN
    RAISE EXCEPTION 'EMPTY_INPUT: p_workers must be a non-empty jsonb array';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.admins a
    WHERE a.user_id = p_admin_user_id AND a.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: user % is not an admin of company %',
      p_admin_user_id, p_company_id;
  END IF;

  v_emp_set := ARRAY(
    SELECT (w->>'employee_id')::text
    FROM jsonb_array_elements(p_workers) AS w
  );
  v_phone_set := ARRAY(
    SELECT (w->>'phone')::text
    FROM jsonb_array_elements(p_workers) AS w
  );

  SELECT COUNT(DISTINCT e) INTO v_emp_distinct FROM unnest(v_emp_set) AS e;
  SELECT COUNT(DISTINCT p) INTO v_phone_distinct FROM unnest(v_phone_set) AS p;

  IF v_emp_distinct < array_length(v_emp_set, 1) THEN
    RAISE EXCEPTION 'DUPLICATE_EMPLOYEE_ID: in-batch duplicate employee_id detected';
  END IF;
  IF v_phone_distinct < array_length(v_phone_set, 1) THEN
    RAISE EXCEPTION 'DUPLICATE_PHONE: in-batch duplicate phone detected';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.workers wk
    WHERE wk.company_id = p_company_id AND wk.employee_id = ANY(v_emp_set)
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_EMPLOYEE_ID: one or more employee_ids already exist in this tenant';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.workers wk
    WHERE wk.company_id = p_company_id AND wk.phone = ANY(v_phone_set)
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_PHONE: one or more phones already exist in this tenant';
  END IF;

  v_now := date_trunc('milliseconds', now());

  FOR v_worker_record IN SELECT * FROM jsonb_array_elements(p_workers)
  LOOP
    v_employee_id  := (v_worker_record->>'employee_id')::text;
    v_first_name   := (v_worker_record->>'first_name')::text;
    v_last_name    := (v_worker_record->>'last_name')::text;
    v_phone        := (v_worker_record->>'phone')::text;
    v_myob_card_id := NULLIF((v_worker_record->>'myob_card_id')::text, '');

    IF v_phone !~ '^\+\d{8,15}$' THEN
      RAISE EXCEPTION 'INVALID_PHONE_FORMAT: phone "%" does not match E.164', v_phone;
    END IF;

    INSERT INTO public.workers (
      company_id, first_name, last_name, phone, employee_id,
      myob_card_id, is_active, created_at, updated_at
    ) VALUES (
      p_company_id, v_first_name, v_last_name, v_phone, v_employee_id,
      v_myob_card_id, TRUE, v_now, v_now
    )
    RETURNING id INTO v_new_worker_id;

    v_event_created_at := v_now + (v_event_count * interval '1 millisecond');
    v_created_at_iso := to_char(
      v_event_created_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    );

    v_canonical_json :=
      '{"created_via":"bulk_upload","employee_id":"' || v_employee_id ||
      '","employee_name":"' || v_first_name || ' ' || v_last_name ||
      '","myob_card_id":' || COALESCE('"' || v_myob_card_id || '"', 'null') ||
      ',"phone_e164":"' || v_phone || '"}';

    v_event_data := v_canonical_json::jsonb;

    v_hash_input :=
      p_company_id::text || '|' ||
      v_new_worker_id::text || '|' ||
      '' || '|' ||
      'WORKER_CREATED' || '|' ||
      v_canonical_json || '|' ||
      v_created_at_iso;

    v_event_hash := encode(digest(v_hash_input::bytea, 'sha256'), 'hex');

    INSERT INTO public.shift_events (
      company_id, worker_id, site_id, event_type, event_data,
      device_metadata, event_hash, previous_event_hash, spec_version,
      created_at, created_by
    ) VALUES (
      p_company_id, v_new_worker_id, NULL, 'WORKER_CREATED', v_event_data,
      '{}', v_event_hash, NULL, '0',
      v_event_created_at, p_admin_user_id::text
    );

    v_event_count := v_event_count + 1;

    out_worker_id   := v_new_worker_id;
    out_employee_id := v_employee_id;
    out_phone       := v_phone;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bulk_create_workers(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_create_workers(uuid, uuid, jsonb) TO service_role;
