-- CRACK 191 — drop the allocate_founding_spot RPC now that the
-- inline optimistic-lock in webhook-handlers.ts has replaced it.
-- The function is no longer called by any code path.
-- Safe to apply at any time: IF EXISTS guards against double-apply.

DROP FUNCTION IF EXISTS allocate_founding_spot();