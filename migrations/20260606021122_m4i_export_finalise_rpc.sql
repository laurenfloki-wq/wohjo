-- M4-I — atomic export finalise.
--
-- JS owns the three-phase split:
--   PHASE 1 (claim)    — read eligible shifts (no lock; cheap)
--   PHASE 2 (generate) — build manifest, generate xlsx + PDF, upload
--                         to Storage. No row locks held here per the
--                         Phase 1 fold-in: storage I/O OUTSIDE locks.
--                         JS computes pre-sealed WLES events using
--                         the v1 chain tail at this moment.
--   PHASE 3 (finalise) — call this RPC. The RPC re-acquires
--                         FOR UPDATE on the claimed shifts, verifies
--                         the chain tail hasn't moved (so the
--                         pre-sealed events still chain correctly),
--                         verifies idempotency, and atomically
--                         inserts pack + export + pre-sealed events +
--                         flips shifts to EXPORTED.
--
-- On stale chain tail or concurrent re-export, the RPC raises a
-- distinguishable error so JS retries with a fresh chain tail (the
-- pre-sealing repeats, the RPC re-runs). Bounded by the route layer.
--
-- p_pack_data fields: canonical_manifest_jsonb (jsonb), pack_fingerprint,
--   payroll_file_storage_path, payroll_file_mime, payroll_file_hash,
--   audit_pack_storage_path, audit_pack_mime, audit_pack_hash.
-- p_export_data fields: pay_period_start, pay_period_end, export_target,
--   total_shifts, total_hours, file_hash, payroll_file_storage_path,
--   payroll_file_mime, exported_by.
-- p_events: array of pre-sealed event objects each carrying
--   {worker_id, site_id, event_data, event_hash, previous_event_hash,
--    wles_event, created_by}.

CREATE OR REPLACE FUNCTION public.export_finalise(
  p_company_id        uuid,
  p_admin_user_id     uuid,
  p_idempotency_key   text,
  p_shift_ids         uuid[],
  p_chain_tail_at_seal text,
  p_pack_data         jsonb,
  p_export_data       jsonb,
  p_events            jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_existing_pack_id  uuid;
  v_existing_export   uuid;
  v_locked_count      int;
  v_pack_id           uuid;
  v_export_id         uuid;
  v_current_tail      text;
  v_event             jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admins a
    WHERE a.user_id = p_admin_user_id AND a.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: user % is not an admin of company %',
      p_admin_user_id, p_company_id;
  END IF;

  -- 0. Idempotency: if a pack already exists for this key, return it.
  SELECT id INTO v_existing_pack_id
  FROM public.export_packs
  WHERE idempotency_key = p_idempotency_key;
  IF v_existing_pack_id IS NOT NULL THEN
    SELECT id INTO v_existing_export
    FROM public.exports
    WHERE pack_id = v_existing_pack_id
    LIMIT 1;
    RETURN jsonb_build_object(
      'idempotent', true,
      'pack_id',  v_existing_pack_id,
      'export_id', v_existing_export
    );
  END IF;

  -- 1. FOR UPDATE on the claimed shifts. Confirm every one is still
  --    eligible (SUPERVISOR_APPROVED or PAYROLL_APPROVED, not already
  --    exported) and belongs to the calling company.
  SELECT count(*) INTO v_locked_count
  FROM public.shifts
  WHERE id = ANY(p_shift_ids)
    AND company_id = p_company_id
    AND status IN ('SUPERVISOR_APPROVED','PAYROLL_APPROVED')
    AND export_id IS NULL
  FOR UPDATE;

  IF v_locked_count IS NULL OR v_locked_count <> array_length(p_shift_ids, 1) THEN
    RAISE EXCEPTION 'CONCURRENT_EXPORTER: % of % shifts no longer eligible',
      COALESCE(array_length(p_shift_ids, 1), 0) - COALESCE(v_locked_count, 0),
      COALESCE(array_length(p_shift_ids, 1), 0);
  END IF;

  -- 2. Verify the v1 chain tail at-seal still matches the live tail.
  --    If it has moved, the pre-sealed previous_event_hash values are
  --    stale — JS must reseal and re-call.
  SELECT event_hash INTO v_current_tail
  FROM public.shift_events
  WHERE company_id = p_company_id AND spec_version = '1.0'
  ORDER BY created_at DESC, id DESC
  LIMIT 1;
  IF v_current_tail IS DISTINCT FROM p_chain_tail_at_seal THEN
    RAISE EXCEPTION 'CHAIN_TAIL_MOVED: expected %, found %',
      p_chain_tail_at_seal, COALESCE(v_current_tail, '<null>');
  END IF;

  -- 3. Insert export_packs.
  INSERT INTO public.export_packs (
    pack_format_version, canonical_manifest_jsonb, pack_fingerprint,
    idempotency_key, payroll_file_storage_path, payroll_file_mime,
    payroll_file_hash, audit_pack_storage_path, audit_pack_mime,
    audit_pack_hash, generated_by
  ) VALUES (
    'pack-v1.0',
    (p_pack_data->>'canonical_manifest_jsonb')::jsonb,
    p_pack_data->>'pack_fingerprint',
    p_idempotency_key,
    p_pack_data->>'payroll_file_storage_path',
    p_pack_data->>'payroll_file_mime',
    p_pack_data->>'payroll_file_hash',
    p_pack_data->>'audit_pack_storage_path',
    p_pack_data->>'audit_pack_mime',
    p_pack_data->>'audit_pack_hash',
    p_admin_user_id
  )
  RETURNING id INTO v_pack_id;

  -- 4. Insert exports linked to the pack.
  INSERT INTO public.exports (
    company_id, pay_period_start, pay_period_end, export_target,
    shift_ids, total_shifts, total_hours, file_hash,
    exported_by, exported_at,
    pack_id, payroll_file_storage_path, payroll_file_mime
  ) VALUES (
    p_company_id,
    (p_export_data->>'pay_period_start')::date,
    (p_export_data->>'pay_period_end')::date,
    p_export_data->>'export_target',
    p_shift_ids,
    (p_export_data->>'total_shifts')::int,
    (p_export_data->>'total_hours')::numeric,
    p_export_data->>'file_hash',
    p_admin_user_id,
    now(),
    v_pack_id,
    p_export_data->>'payroll_file_storage_path',
    p_export_data->>'payroll_file_mime'
  ) RETURNING id INTO v_export_id;

  -- 5. Insert pre-sealed EXPORT_RECORD shift_events. Each event's
  --    previous_event_hash is already wired by the JS sealer; we
  --    rely on the chain-integrity trigger to fail if anything is off.
  FOR v_event IN SELECT * FROM jsonb_array_elements(p_events)
  LOOP
    INSERT INTO public.shift_events (
      company_id, worker_id, site_id, event_type, event_data,
      device_metadata, event_hash, previous_event_hash, spec_version,
      wles_event, created_by
    ) VALUES (
      p_company_id,
      (v_event->>'worker_id')::uuid,
      NULLIF(v_event->>'site_id','')::uuid,
      'EXPORT_RECORD',
      COALESCE(v_event->'event_data', '{}'::jsonb),
      '{}'::jsonb,
      v_event->>'event_hash',
      v_event->>'previous_event_hash',
      '1.0',
      v_event->'wles_event',
      v_event->>'created_by'
    );
  END LOOP;

  -- 6. Flip shifts to EXPORTED with optimistic-lock guard.
  UPDATE public.shifts
  SET status = 'EXPORTED',
      export_id = v_export_id,
      updated_at = now()
  WHERE id = ANY(p_shift_ids)
    AND status IN ('SUPERVISOR_APPROVED','PAYROLL_APPROVED')
    AND export_id IS NULL;

  RETURN jsonb_build_object(
    'idempotent', false,
    'pack_id',  v_pack_id,
    'export_id', v_export_id
  );
END;
$function$;

COMMENT ON FUNCTION public.export_finalise IS
  'M4-I (2026-06-06): atomic finalise of an export operation. JS pre-seals EXPORT_RECORD events chained off the v1 tail (PHASE 2), then calls this RPC (PHASE 3). The RPC re-locks claimable shifts FOR UPDATE, verifies idempotency on idempotency_key, verifies the chain tail has not moved, inserts pack+export+events+flips shifts, all in one transaction. Raises CONCURRENT_EXPORTER or CHAIN_TAIL_MOVED for the JS retry loop.';