-- Security remediation B(ii) follow-up — explicit service-role policy
-- on rate_limit_buckets (2026-06-10).
--
-- The original sec_b2 migration enabled RLS with no policies and the
-- gate report called the resulting rls_enabled_no_policy advisor INFO
-- "intentional". Per the engineering standard (S1.5, S4): never
-- relabel an advisor finding as intentional — service-only tables get
-- an explicit service_role-only policy, not "no policy". This mirrors
-- the service_role_full_access pattern used across the schema.
--
-- Behaviour: none. The service role already bypasses RLS; anon and
-- authenticated remain denied (no policy grants them anything). This
-- makes the intent explicit in pg_policies and clears the advisor
-- finding instead of explaining it away.
--
-- Idempotent. Reversible (see bottom).

drop policy if exists rate_limit_buckets_service_only on public.rate_limit_buckets;
create policy rate_limit_buckets_service_only on public.rate_limit_buckets
  for all to service_role
  using (true)
  with check (true);

-- Rollback:
--   drop policy if exists rate_limit_buckets_service_only on public.rate_limit_buckets;
