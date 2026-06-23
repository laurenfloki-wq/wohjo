-- WLES-6 — shift_commit_completeness reconciliation alarm (audit WLES-6).
--
-- /api/field/shift/end seals END_EVENT + SHIFT_COMMIT and moves the shift to
-- SUBMITTED. If the SHIFT_COMMIT insert fails it returns a degraded 200: the
-- shift is SUBMITTED with NO sealed commit, yet it is approvable and payable.
-- chain-verify detects BROKEN links, not MISSING expected events, so this gap
-- is silent. This view surfaces any shift in the approvable/payable window
-- (SUBMITTED / SUPERVISOR_APPROVED / PAYROLL_APPROVED) that lacks a SHIFT_COMMIT
-- so the daily substrate-health cron can RED-alert on it.
--
-- EXPORTED is excluded (post-pay-run / historical) and a known seed-data
-- orphan is baselined in code (see src/lib/wles/shift-commit-completeness.ts).
-- SHIFT_COMMIT is linked by event_data->>'shift_id' — the same key the
-- shift_events_shift_commit_unique index uses.
--
-- security_invoker = on: the view respects the querying role's RLS on the
-- underlying tables (cross-tenant-safe; the cron's service_role bypasses RLS by
-- design) and avoids the SECURITY DEFINER-view security-advisor finding.

CREATE OR REPLACE VIEW public.v_shift_commit_orphans
WITH (security_invoker = on) AS
SELECT s.id AS shift_id, s.company_id, s.status
FROM public.shifts s
WHERE s.status IN ('SUBMITTED', 'SUPERVISOR_APPROVED', 'PAYROLL_APPROVED')
  AND NOT EXISTS (
    SELECT 1 FROM public.shift_events e
    WHERE e.event_type = 'SHIFT_COMMIT'
      AND e.event_data->>'shift_id' = s.id::text
  );

-- System-internal view: only the cron (service_role) reads it.
REVOKE ALL ON public.v_shift_commit_orphans FROM anon, authenticated;
GRANT SELECT ON public.v_shift_commit_orphans TO service_role;

-- Admit the new health check past the check_name CHECK constraint (else the
-- health insert is silently rejected — the notification_outbound trap).
ALTER TABLE public.substrate_health_log
  DROP CONSTRAINT IF EXISTS substrate_health_log_check_name_check;
ALTER TABLE public.substrate_health_log
  ADD CONSTRAINT substrate_health_log_check_name_check
  CHECK (check_name = ANY (ARRAY[
    'chain_integrity_shift_events',
    'chain_integrity_shift_events_ex_baseline',
    'chain_integrity_auth_events',
    'advisor_sweep',
    'webhook_delivery_twilio',
    'webhook_delivery_stripe',
    'webhook_delivery_supabase_auth',
    'cron_health',
    'error_rate',
    'anchor_fingerprint',
    'notification_outbound',
    'chain_count_anchor',
    'shift_commit_completeness'
  ]));
