-- Day 3 P3 — bound geofence_radius_metres between 50 and 1000.
-- Matches Privacy Policy claim that geofences are scoped to work-site
-- scale. Default unchanged at 200m.
--
-- Pre-flight (MUST run first, read-only):
--
--   SELECT id, name, geofence_radius_metres
--   FROM sites
--   WHERE geofence_radius_metres IS NOT NULL
--     AND (geofence_radius_metres < 50 OR geofence_radius_metres > 1000);
--
-- If that returns any rows, DO NOT run this migration until those
-- rows are either (a) corrected or (b) accepted by Lauren with a
-- written note recording why a tenant has a deliberately wide or
-- narrow geofence.

ALTER TABLE sites
  ADD CONSTRAINT geofence_radius_bounded
  CHECK (geofence_radius_metres IS NULL OR (geofence_radius_metres BETWEEN 50 AND 1000));

-- Default stays at 200m (already in the column definition).
-- No change needed here.
