-- CRACK 196: drop dormant anon select policy on founding_config.
-- Verified safe: no unauthenticated readers of founding_config exist in src/.
-- CRACK 187 refuted the LandingPage.tsx claim; only callsite is a service_role RPC.

DROP POLICY IF EXISTS anon_select_founding_config ON public.founding_config;