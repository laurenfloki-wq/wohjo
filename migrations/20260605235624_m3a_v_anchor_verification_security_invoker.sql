-- M3a — switch v_anchor_verification to SECURITY INVOKER so it
-- respects the caller's privileges + RLS instead of the view
-- owner's. Postgres 15+ supports the security_invoker view option;
-- without it the view runs with the owner's privileges, which the
-- Supabase security advisor (correctly) flags as ERROR for
-- externally-facing views.

ALTER VIEW public.v_anchor_verification SET (security_invoker = true);