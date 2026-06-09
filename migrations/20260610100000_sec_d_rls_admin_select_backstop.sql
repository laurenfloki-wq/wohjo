-- Security remediation D — RLS backstop tightening (2026-06-10)
--
-- Six tables carried a broad authenticated_select_own_company SELECT
-- policy but have NO browser-client reads: workers, shifts, sites,
-- exports, supervisors, shift_events. The app reads them via service
-- role after server-side company derivation, so the broad policy was
-- unused surface. Tighten SELECT to admin-of-company only.
--
-- geofence_events is deliberately NOT touched: useGeofenceWatch.ts
-- reads/writes it via the browser client; its authenticated policies
-- are load-bearing.
--
-- Idempotent. Reversible (see bottom).

drop policy if exists authenticated_select_own_company on public.workers;
create policy workers_admin_select on public.workers
  for select to authenticated
  using (company_id in (
    select a.company_id from public.admins a where a.user_id = (select auth.uid())
  ));

drop policy if exists authenticated_select_own_company on public.shifts;
create policy shifts_admin_select on public.shifts
  for select to authenticated
  using (company_id in (
    select a.company_id from public.admins a where a.user_id = (select auth.uid())
  ));

drop policy if exists authenticated_select_own_company on public.sites;
create policy sites_admin_select on public.sites
  for select to authenticated
  using (company_id in (
    select a.company_id from public.admins a where a.user_id = (select auth.uid())
  ));

drop policy if exists authenticated_select_own_company on public.exports;
create policy exports_admin_select on public.exports
  for select to authenticated
  using (company_id in (
    select a.company_id from public.admins a where a.user_id = (select auth.uid())
  ));

drop policy if exists authenticated_select_own_company on public.supervisors;
create policy supervisors_admin_select on public.supervisors
  for select to authenticated
  using (company_id in (
    select a.company_id from public.admins a where a.user_id = (select auth.uid())
  ));

drop policy if exists authenticated_select_own_company on public.shift_events;
create policy shift_events_admin_select on public.shift_events
  for select to authenticated
  using (company_id in (
    select a.company_id from public.admins a where a.user_id = (select auth.uid())
  ));

-- DO NOT modify geofence_events.

-- Rollback: drop the *_admin_select policies and re-create
-- authenticated_select_own_company per table with
--   using (company_id = (((select auth.jwt()) -> 'app_metadata' ->> 'company_id'))::uuid)
