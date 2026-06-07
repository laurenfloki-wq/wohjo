-- M1-recon-F (M0f) — split bulk_create_workers RPC. The pre-M1 RPC
-- inserted a WORKER_CREATED shift_event for each worker, stamping
-- spec_version='0' AND previous_event_hash=NULL. Post-cutover the
-- substrate rejects that shape in two independent ways:
--   (a) the chain-integrity trigger fires on prev=NULL whenever the
--       company already has events (verified live: "Chain integrity
--       violation: expected previous_event_hash=92fbeca7..., got=<NULL>");
--   (b) shift_events_post_cutover_spec_v1 blocks the v0 stamp.
--
-- This migration drops the shift_events INSERT from the RPC. Worker
-- creation, deduplication and the SECURITY DEFINER + atomic
-- behaviours are preserved. The route handler now mints
-- WORKER_CREATED v1 events per created worker via insertV1Event,
-- chained off the live v1 tail with company_id asserted and the
-- substrate column carrying the FLOSTRUCTION canonical name
-- 'WORKER_CREATED' (Option B).
--
-- Atomicity caveat: if event sealing fails after worker INSERTs
-- commit, the workers exist without an accompanying WORKER_CREATED
-- shift_event. That is a recoverable inconsistency (the workers
-- exist; an operator backfill can append the missing events later)
-- and is preferable to the alternative of a PL/pgSQL WLES JCS seal
-- that would risk drift from the JS implementation in src/lib/wles/v1.

CREATE OR REPLACE FUNCTION public.bulk_create_workers(
  p_company_id   uuid,
  p_admin_user_id uuid,
  p_workers      jsonb
) RETURNS TABLE(
  out_worker_id  uuid,
  out_employee_id text,
  out_phone      text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_now              timestamptz;
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

    out_worker_id   := v_new_worker_id;
    out_employee_id := v_employee_id;
    out_phone       := v_phone;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$function$;

COMMENT ON FUNCTION public.bulk_create_workers(uuid, uuid, jsonb) IS
  'M1-recon-F (2026-06-06): worker INSERTs only. The WORKER_CREATED shift_event is now minted from /api/admin/workers/bulk-upload via insertV1Event so the WLES v1.0 sealing logic lives in TypeScript alongside every other write path. The route asserts company_id and chains each event off the live v1 tail with previous_event_hash set.';