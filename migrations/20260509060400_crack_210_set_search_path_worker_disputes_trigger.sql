-- CRACK 210: Set explicit search_path on set_worker_disputes_updated_at
-- Function created in CRACK 195 without SET search_path clause. Per advisor 0011,
-- functions with mutable search_path can be vulnerable to schema-level attacks
-- where a malicious actor with privileges to create objects in the search_path
-- could shadow built-ins (e.g. now()).
-- 
-- Setting search_path = '' is the most defensive option. The function body only
-- references now() (resolved via pg_catalog which is always implicitly searched
-- regardless of search_path setting) and NEW (trigger context variable). No
-- user-schema references. Empty search_path eliminates any shadowing surface.

ALTER FUNCTION public.set_worker_disputes_updated_at() SET search_path = '';