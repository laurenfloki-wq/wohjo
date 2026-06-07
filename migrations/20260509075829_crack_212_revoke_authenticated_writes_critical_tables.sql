-- CRACK 212 (conservative path): REVOKE write privileges from authenticated on the 7
-- highest-value tables identified in forensic audit pass 1.
--
-- Functional risk: zero. RLS policies for these tables either don't grant write access to
-- authenticated, or service_role bypasses RLS for legitimate writes. REVOKE is defense-in-
-- depth: even if RLS were misconfigured later, table-level grant denies the write.
--
-- Conservative scope (this migration): tables where authenticated should categorically
-- have no write capability:
--   - admin_access_log: audit log, append-only, server-only writes
--   - dispatcher_audit_log: audit log, append-only, server-only writes
--   - shift_events: WLES chain immutable after INSERT, server-only writes via API routes
--   - auth_events: Phase 8 hook is the only legitimate writer
--   - founding_config: admin-only config, no client writes
--   - webhook_idempotency: server-only deduplication state
--   - tenant_activity_mappings: server-only mapping table
--
-- Aggressive path (deferred to follow-up if Lauren approves): REVOKE writes from
-- authenticated on ALL public tables since all writes traverse service_role API routes.
-- This conservative cut closes the highest-value defense-in-depth gaps without any
-- assumption that may not hold.

-- Audit logs
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.admin_access_log FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.dispatcher_audit_log FROM authenticated;

-- WLES chain integrity
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.shift_events FROM authenticated;

-- Phase 8 auth events
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.auth_events FROM authenticated;

-- Server-only state/config
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.founding_config FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.webhook_idempotency FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.tenant_activity_mappings FROM authenticated;