-- Forward-drop of the deny_all_non_service policies created by
-- 20260623012112_harden_rls_deny_all_internal_tables.
--
-- WHY: the explicit deny-all policy on notification_dead_letter + wles_v1_watermark
-- is security-redundant — RLS is already enabled with no policy (= deny-all for
-- anon/authenticated) and service_role bypasses RLS via grants. More to the point,
-- an explicit policy renders differently between the drift-gate and the full-graph
-- attestation fingerprint queries, breaking the policies reference pin. It was
-- dropped in prod on 2026-06-23 to return the drift gate to green (live policies =
-- 46 = committed reference). This migration captures that drop so a clean empty-DB
-- replay nets to the current state: harden_rls (012112) creates → this drops → 0
-- policies on both tables, matching prod and the pinned reference.
--
-- Tables stay locked: RLS enabled + no policy = default deny for anon/authenticated;
-- service_role bypass unchanged. See 20260622160000_sec5_advisor_cleanup.sql.

drop policy if exists "deny_all_non_service" on public.notification_dead_letter;
drop policy if exists "deny_all_non_service" on public.wles_v1_watermark;
