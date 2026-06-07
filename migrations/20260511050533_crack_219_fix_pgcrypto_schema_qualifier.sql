-- CRACK 219 hotfix #2: fully qualify digest() as extensions.digest()
-- pgcrypto on Supabase lives in `extensions` schema, not `public`.
-- Function's SET search_path = public can't see it.
-- Hash output identical bytes either way; TS-side verifier still matches.

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
  IF p_shift_ids IS NULL OR array_length(p_shift_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'EMPTY_INPUT: p_shift_ids must be a non-empty array';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.admins
    WHERE user_id = p_admin_user_id
      AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: user % is not an admin of company %',
      p_admin_user_id, p_company_id;
  END IF;

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

  SELECT
    MIN(shift_date),
    MAX(shift_date),
    SUM(total_hours)
  INTO v_pay_period_start, v_pay_period_end, v_total_hours
  FROM public.shifts
  WHERE id = ANY(p_shift_ids);

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

  FOR v_shift IN
    SELECT s.id, s.worker_id, s.site_id, s.company_id, s.receipt_id
    FROM   public.shifts s
    WHERE  s.id = ANY(p_shift_ids)
    ORDER BY s.worker_id, s.id
    FOR UPDATE
  LOOP
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

  CREATE TEMP TABLE _export_chain_heads (
    worker_id         uuid PRIMARY KEY,
    last_event_id     uuid,
    last_event_hash   text
  ) ON COMMIT DROP;

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

  INSERT INTO _export_chain_heads (worker_id, last_event_id, last_event_hash)
  SELECT DISTINCT s.worker_id, NULL::uuid, NULL::text
  FROM   public.shifts s
  WHERE  s.id = ANY(p_shift_ids)
  ON CONFLICT (worker_id) DO NOTHING;

  FOR v_shift IN
    SELECT s.id, s.worker_id, s.site_id, s.company_id, s.receipt_id
    FROM   public.shifts s
    WHERE  s.id = ANY(p_shift_ids)
    ORDER BY s.worker_id, s.id
  LOOP
    SELECT last_event_id, last_event_hash
    INTO   v_prior_event_id, v_prior_event_hash
    FROM   _export_chain_heads
    WHERE  worker_id = v_shift.worker_id;

    v_event_created_at := v_now + (v_event_count * interval '1 millisecond');
    v_created_at_iso   := to_char(
      v_event_created_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    );

    v_canonical_json :=
      '{"export_id":"' || v_export_id::text ||
      '","file_hash":"' || p_file_hash ||
      '","provider":"myob","receipt_id":"' || v_shift.receipt_id ||
      '","shift_id":"' || v_shift.id::text || '"}';

    v_hash_input :=
      coalesce(v_shift.company_id, p_company_id)::text || '|' ||
      v_shift.worker_id::text                          || '|' ||
      coalesce(v_shift.site_id::text, '')              || '|' ||
      'EXPORT_RECORD'                                  || '|' ||
      v_canonical_json                                 || '|' ||
      v_created_at_iso;

    -- HOTFIX #2: fully qualify pgcrypto's digest() since pgcrypto lives in extensions schema
    v_event_hash := encode(extensions.digest(v_hash_input::bytea, 'sha256'), 'hex');

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

    UPDATE _export_chain_heads
    SET    last_event_id   = v_event_id,
           last_event_hash = v_event_hash
    WHERE  worker_id = v_shift.worker_id;

    v_event_ids   := array_append(v_event_ids, v_event_id);
    v_event_count := v_event_count + 1;
  END LOOP;

  RETURN QUERY
  SELECT v_export_id, v_shift_array, v_event_count, v_event_ids;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_flostruction_export(uuid, uuid, uuid[], text)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.process_flostruction_export(uuid, uuid, uuid[], text)
  TO service_role;