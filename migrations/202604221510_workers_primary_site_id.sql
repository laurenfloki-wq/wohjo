-- /field PWA redesign — add workers.primary_site_id
--
-- The B1 home-screen spec says:
--   "Your site geofence will detect you when you arrive at
--    [worker's suggested default site]."
--
-- ADVISORY, NOT A HARD ASSIGNMENT — per founder direction 2026-04-22 (Q9):
-- Labour-hire workers move between sites. This column is a "suggested
-- default" or "last known site" for the geofence watcher's convenience;
-- it is NEVER a hard assignment. Workers clock in at any site the
-- supervisor has them on; shifts record their actual site_id, not this
-- column. The home screen falls back to "most-recent-shift site" when
-- this is NULL, and to a generic onboarding message when the worker
-- has no shifts either.
--
-- DDL properties confirming the advisory semantics:
--   - NULLABLE (no NOT NULL): absence of a default is legitimate state
--   - ON DELETE SET NULL: site deletion does not break the worker row
--   - No DEFAULT: new INSERTs that don't specify the column get NULL
--   - No UNIQUE: many workers can share the same suggested default
--   - No CHECK: no enforced value set
--   - Partial index is a performance optimisation, not a constraint

BEGIN;

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS primary_site_id uuid
  REFERENCES sites(id) ON DELETE SET NULL;

-- Record the advisory intent in the database itself so future
-- developers (and future Cowork sessions) inherit the semantics.
COMMENT ON COLUMN workers.primary_site_id IS
  'ADVISORY only — suggested default site for geofence watch. Never a hard assignment. Labour-hire workers move between sites; the authoritative per-shift site_id lives on the shifts row, not here. Nullable by design.';

CREATE INDEX IF NOT EXISTS idx_workers_primary_site_id
  ON workers(primary_site_id) WHERE primary_site_id IS NOT NULL;

-- Verification count — how many workers now carry a primary_site_id.
SELECT 'workers with primary_site_id' AS label,
       count(*) FILTER (WHERE primary_site_id IS NOT NULL) AS with_site,
       count(*) FILTER (WHERE primary_site_id IS NULL) AS without_site,
       count(*) AS total
FROM workers
WHERE is_active = true;

COMMIT;
