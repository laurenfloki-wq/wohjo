-- Explicit deny-all on service-role-only internal tables.
-- service_role bypasses RLS, so app writes are unaffected; this only documents
-- intent and clears the rls_enabled_no_policy advisor. Reversible via DROP POLICY.

drop policy if exists "deny_all_non_service" on public.notification_dead_letter;
create policy "deny_all_non_service" on public.notification_dead_letter
  as permissive for all to public using (false) with check (false);

drop policy if exists "deny_all_non_service" on public.wles_v1_watermark;
create policy "deny_all_non_service" on public.wles_v1_watermark
  as permissive for all to public using (false) with check (false);
