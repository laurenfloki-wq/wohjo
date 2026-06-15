-- 20260615060953_sg6_security_advisor_sweep_view
--
-- SG-6 observability: implement the advisor_sweep FLOS-SHA-001 check by
-- exposing the SQL-observable structural-security invariants through a view.
-- The service-role cron client reads via PostgREST and cannot query
-- pg_catalog directly, so the check reads this view instead.
--
-- security_invoker = true: runs with the caller's (service_role) rights and
-- is NOT a SECURITY DEFINER view (which the managed advisor would itself
-- flag). Returns one row per violation:
--   * rls_disabled            - a public table with RLS disabled
--   * secdef_no_search_path   - a public SECURITY DEFINER function that does
--                               not pin search_path
-- Zero rows = GREEN. Applied to production as ledger version 20260615060953;
-- this file carries the identical DDL so prod == migration graph. CHECK/views
-- are not #116c fingerprinted dimensions, so this does not affect drift-gate
-- or full-graph-attestation (view_body fingerprints only v_anchor_verification).

create or replace view public.v_security_advisor_sweep
  with (security_invoker = true) as
  select 'rls_disabled'::text as finding, c.relname::text as object_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
  union all
  select 'secdef_no_search_path'::text as finding, p.proname::text as object_name
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef = true and p.prokind = 'f'
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg
        where cfg like 'search_path=%'
     );

revoke all on public.v_security_advisor_sweep from anon, authenticated;
grant select on public.v_security_advisor_sweep to service_role;
