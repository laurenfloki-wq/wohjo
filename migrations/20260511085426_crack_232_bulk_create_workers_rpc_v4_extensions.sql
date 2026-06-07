-- CRACK 232 v4 — include extensions schema on search_path so the
-- pgcrypto-installed `digest()` resolves under SECURITY DEFINER.
-- pgcrypto lives in `extensions`, not `public`, so `SET search_path =
-- public` alone trips a 42883 missing-function error.

ALTER FUNCTION public.bulk_create_workers(uuid, uuid, jsonb)
  SET search_path = public, extensions;