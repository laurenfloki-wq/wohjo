-- WLES integrity, Theme A part 2: live v1 count high-water-mark (audit A1).
--
-- The frozen FROZEN_ANCHOR_V0 anchor covers only the closed pre-2026-06-04 v0
-- population. Every production v1 event sits outside any anchor, and the daily
-- verify-hashes cron only walks self-hash + linkage. Deleting the most-recent N
-- events leaves a perfectly-linked prefix, so tail-truncation of the current
-- pay period's wage events is UNDETECTABLE and the alarm stays GREEN.
--
-- Fix: a per-company monotonic high-water-mark of the v1 event count plus the
-- tail event hash, ADVANCED AT INSERT TIME by a trigger (so even same-day
-- deletion before the cron runs is caught — a cron-advanced mark would have a
-- blind spot). The cron compares the live count to the mark: a drop = deletion.
--
-- Tamper posture: the mark is advanced by a SECURITY DEFINER trigger (runs as
-- the owner), and INSERT/UPDATE/DELETE are revoked from service_role, so the
-- app role cannot lower it. A full-DB-access actor who also rewrites the mark
-- and re-links the chain is out of scope here (that needs external anchoring,
-- tracked separately) — this closes the simple, likely attack: silent deletion.

CREATE TABLE IF NOT EXISTS public.wles_v1_watermark (
  company_id     uuid PRIMARY KEY,
  event_count    bigint NOT NULL DEFAULT 0,
  tail_event_hash text,
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- RLS denies authenticated/anon (no policy); service_role has BYPASSRLS so its
-- access is governed by the grants below.
ALTER TABLE public.wles_v1_watermark ENABLE ROW LEVEL SECURITY;

-- The cron reads the mark as service_role; it must NEVER be able to write it.
GRANT SELECT ON public.wles_v1_watermark TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.wles_v1_watermark FROM service_role;

-- Insert-time advance. SECURITY DEFINER so it writes the mark despite
-- service_role lacking the grant. Wrapped so a watermark failure can NEVER
-- abort the shift_events insert — sealing the event matters more than the mark,
-- and a stalled mark only weakens detection, it cannot raise a false alarm.
CREATE OR REPLACE FUNCTION public.advance_wles_v1_watermark()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $func$
BEGIN
  IF NEW.spec_version = '1.0' AND NEW.wles_event IS NOT NULL AND NEW.company_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.wles_v1_watermark AS w (company_id, event_count, tail_event_hash, updated_at)
      VALUES (NEW.company_id, 1, COALESCE(NEW.wles_event->>'event_hash', NEW.event_hash), now())
      ON CONFLICT (company_id) DO UPDATE
        SET event_count     = w.event_count + 1,
            tail_event_hash = EXCLUDED.tail_event_hash,
            updated_at      = now();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'wles_v1_watermark advance failed for company %: %', NEW.company_id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS shift_events_advance_v1_watermark ON public.shift_events;
CREATE TRIGGER shift_events_advance_v1_watermark
  AFTER INSERT ON public.shift_events
  FOR EACH ROW EXECUTE FUNCTION public.advance_wles_v1_watermark();

-- Seed the mark from the CURRENT live population so the high-water-mark starts
-- at today's true count (the cron alarms if it ever drops below this).
INSERT INTO public.wles_v1_watermark (company_id, event_count, tail_event_hash, first_seen_at, updated_at)
SELECT e.company_id,
       count(*)::bigint,
       (SELECT COALESCE(e2.wles_event->>'event_hash', e2.event_hash)
          FROM public.shift_events e2
         WHERE e2.company_id = e.company_id
           AND e2.spec_version = '1.0' AND e2.wles_event IS NOT NULL
         ORDER BY e2.created_at DESC, e2.id DESC
         LIMIT 1),
       now(), now()
FROM public.shift_events e
WHERE e.spec_version = '1.0' AND e.wles_event IS NOT NULL AND e.company_id IS NOT NULL
GROUP BY e.company_id
ON CONFLICT (company_id) DO NOTHING;
