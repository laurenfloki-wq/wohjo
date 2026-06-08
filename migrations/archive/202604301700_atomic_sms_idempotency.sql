-- 202604301700_atomic_sms_idempotency.sql
--
-- Atomic per-(supervisor, shift) idempotency for the inline supervisor
-- SMS path. Replaces the read-modify-write pattern in
-- src/lib/sms/late-trigger.ts which under concurrent invocation could
-- (a) emit duplicate SMS for the same shift and (b) lose appends to
-- pending_sms_approval_ids when two different shifts arrived within
-- the same read window.
--
-- This function performs the check, append, and stamp atomically as a
-- single UPDATE protected by a contains predicate. PostgreSQL's
-- per-row exclusive lock on UPDATE serialises concurrent attempts so
-- that exactly one invocation succeeds and the others see the code
-- already present and return zero rows.
--
-- Reference: Workstream Blocker 1, founder brief 2026-04-30 evening.
-- Application code: src/lib/sms/late-trigger.ts.

CREATE OR REPLACE FUNCTION append_sms_code_if_absent(
  p_supervisor_id uuid,
  p_code text,
  p_today date,
  p_now timestamptz
)
RETURNS TABLE (id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Atomic check-and-append. The WHERE NOT (... @> ...) clause prevents
  -- a second invocation from re-appending the same code; PostgreSQL's
  -- row-level exclusive lock on UPDATE serialises concurrent calls so
  -- exactly one succeeds. RETURNING surfaces the row only when an
  -- update happened — empty result == "code was already present, skip
  -- the SMS."
  RETURN QUERY
    UPDATE supervisors s
    SET
      pending_sms_approval_ids = array_append(
        coalesce(s.pending_sms_approval_ids, ARRAY[]::text[]),
        p_code
      ),
      last_batch_sms_date = p_today,
      last_batch_sms_sent_at = p_now
    WHERE s.id = p_supervisor_id
      AND NOT (
        coalesce(s.pending_sms_approval_ids, ARRAY[]::text[])
          @> ARRAY[p_code]
      )
    RETURNING s.id;
END;
$$;

-- Permit anonymous + authenticated callers to invoke via PostgREST,
-- but the function body still runs as the function owner (SECURITY
-- DEFINER) so the UPDATE bypasses RLS — which is correct because
-- supervisors.update is service-role-only by default and the inline
-- SMS path needs server-side stamping.
GRANT EXECUTE ON FUNCTION append_sms_code_if_absent(uuid, text, date, timestamptz)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION append_sms_code_if_absent IS
  'Atomic check-and-append for supervisors.pending_sms_approval_ids. '
  'Returns the supervisor id only when the code was newly appended. '
  'Serialises concurrent invocations via row-level UPDATE lock. '
  'Used by src/lib/sms/late-trigger.ts to prevent duplicate worker SMS.';
