-- Add count_broken_chain_links() — a helper present in production
-- but never tracked via migration. chat-Claude's per-function
-- attestation against live production (2026-06-09) identified it
-- as the missing function in the rebuild's 11-function set (rebuild
-- had current_user_company_id which is dropped in the
-- 20260608000000 dashboard-drift migration).
--
-- Production attributes per chat-Claude attestation:
--   - LANGUAGE sql
--   - SECURITY DEFINER (prosecdef = true)
--   - SET search_path TO 'public'  (single entry)
--   - default VOLATILE
--   - RETURNS TABLE(n bigint)        (one-column table, not scalar)
--   - body uses `count(*)::bigint AS n` so the column alias matches
--     the TABLE column name; this is what pg_get_functiondef emits
--     for prod and is required for the per-function md5 to match
--     1b00b2fc1866cd3d0737a2dfbe63c3a3
--     (CORRECTED 2026-06-24: the prior comment claimed 444ac463…, which is
--     stale. Live prod md5(pg_get_functiondef) = 1b00b2fc…, and this committed
--     CREATE OR REPLACE is byte-identical to prod's definition, so a clean
--     replay reproduces 1b00b2fc… exactly. The functions drift dimension is
--     green, confirming prod == committed reference for this function.)
--
-- The 64-zero hash literal is the WLES chain "first event" sentinel
-- (no previous_event_hash by definition); rows carrying it are
-- starts, not continuations, so they are excluded from broken-link
-- counts.
--
-- The follow-up SECURITY DEFINER hardening (locking search_path to
-- the empty string) is proposed as a forward migration in
-- scripts/.116c/PROPOSAL-security-definer-search-path-lock.md — NOT
-- bundled into #47 per the faithful-reproduction rule.

CREATE OR REPLACE FUNCTION public.count_broken_chain_links()
 RETURNS TABLE(n bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT count(*)::bigint AS n
  FROM shift_events s
  WHERE s.previous_event_hash IS NOT NULL
    AND s.previous_event_hash <> '0000000000000000000000000000000000000000000000000000000000000000'
    AND NOT EXISTS (
      SELECT 1 FROM shift_events p WHERE p.event_hash = s.previous_event_hash
    );
$function$;
