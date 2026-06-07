-- CRACK 175: Drop orphaned founding_leads table
-- 
-- Originally tracked CRACK 53 (founding_leads anon_insert spam vector). Variant 4B
-- was selected (rebuild as /api/founding-leads/submit with rate limit), but the
-- code path was never built. The /founding page, /api/founding API route, and
-- /lib/demo dataset were deleted in CRACK 174 deploy wave (commit cc29fb1 +
-- c862e42). The table is now fully orphaned: 0 rows, 0 foreign keys referencing.
-- 
-- Pre-flight verified via execute_sql:
--   - Table exists: yes
--   - Row count: 0
--   - Foreign keys referencing: none
-- 
-- Safe to drop without CASCADE.

DROP TABLE IF EXISTS public.founding_leads;