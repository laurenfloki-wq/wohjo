-- M3 — substrate_anchors + v_anchor_verification + FLOS-SHA-001
-- anchor health check. Per Phase 1 §3a.
--
-- Precision (per substrate review fold-in):
--   * substrate_anchors stores `formula_text` as DOCUMENTATION only —
--     a human-readable record of how a fingerprint was originally
--     produced. The verification view executes the formula inline in
--     its own DDL, hard-coded. An attacker who gains UPDATE on
--     substrate_anchors cannot trick the verifier into computing a
--     different formula; the worst they can do is flip
--     expected_fingerprint, which then diverges from the view's
--     recomputation and trips the FLOS-SHA-001 daily check (RED).
--
--   * v_anchor_verification returns one row per anchor with the
--     recomputed fingerprint alongside the expected, plus a match
--     boolean. The cron compares; matches are GREEN, mismatches RED.

CREATE TABLE IF NOT EXISTS public.substrate_anchors (
  id text PRIMARY KEY,                           -- short stable identifier (FROZEN_ANCHOR_V0 etc.)
  scope_text text NOT NULL,                      -- human description of the scope this anchor pins
  formula_text text NOT NULL,                    -- DOCUMENTATION ONLY — never executed
  expected_fingerprint text NOT NULL,            -- canonical fingerprint at the moment the anchor was bound
  expected_count integer NOT NULL CHECK (expected_count >= 0),
  bound_at timestamptz NOT NULL,                 -- the moment the anchor became immutable in the design
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.substrate_anchors IS
  'Frozen pre-cutover anchors for substrate-integrity proof. Append-only by convention. SELECT permitted to authenticated; INSERT/UPDATE/DELETE service_role only. formula_text is documentation, NOT executed — the verification view executes its formula inline in DDL.';

COMMENT ON COLUMN public.substrate_anchors.formula_text IS
  'Human-readable formula description. Not used at recompute time. The verifier and v_anchor_verification carry their own copies of the formula in code/DDL.';

-- RLS: SELECT to authenticated so directors can read the anchor row
-- and verify the fingerprint against an independent recomputation.
-- All writes are service-role only.
ALTER TABLE public.substrate_anchors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS substrate_anchors_select_authenticated ON public.substrate_anchors;
CREATE POLICY substrate_anchors_select_authenticated
  ON public.substrate_anchors
  FOR SELECT
  TO authenticated
  USING (true);

-- The FROZEN_ANCHOR_V0 row — pre-cutover boundary, the canonical
-- pre-WLES-v1 immutable anchor.
INSERT INTO public.substrate_anchors
  (id, scope_text, formula_text, expected_fingerprint, expected_count, bound_at)
VALUES (
  'FROZEN_ANCHOR_V0',
  E'shift_events WHERE spec_version=''0'' AND created_at < ''2026-06-04T02:56:50Z''',
  E'md5(string_agg(id::text || '':'' || event_hash, ''|'' ORDER BY created_at, id))',
  '8e6d4af90792eadb47f9205fe18e6325',
  32,
  '2026-06-04T02:56:50Z'
) ON CONFLICT (id) DO NOTHING;

-- v_anchor_verification — runs the formula inline. The CASE per
-- anchor id keeps the formula visible in code review: any future
-- anchor must be added explicitly here, AND in the verifier script.
-- This is the intended forcing function — anchors cannot be added
-- by data-only writes; they require a code change in two places.
CREATE OR REPLACE VIEW public.v_anchor_verification AS
SELECT
  a.id,
  a.scope_text,
  a.expected_fingerprint,
  a.expected_count,
  a.bound_at,
  CASE a.id
    WHEN 'FROZEN_ANCHOR_V0' THEN
      (SELECT md5(string_agg(id::text || ':' || event_hash, '|' ORDER BY created_at, id))
       FROM public.shift_events
       WHERE spec_version = '0' AND created_at < TIMESTAMPTZ '2026-06-04T02:56:50Z')
    ELSE NULL
  END AS actual_fingerprint,
  CASE a.id
    WHEN 'FROZEN_ANCHOR_V0' THEN
      (SELECT count(*)::integer
       FROM public.shift_events
       WHERE spec_version = '0' AND created_at < TIMESTAMPTZ '2026-06-04T02:56:50Z')
    ELSE NULL
  END AS actual_count,
  CASE a.id
    WHEN 'FROZEN_ANCHOR_V0' THEN
      a.expected_fingerprint = (
        SELECT md5(string_agg(id::text || ':' || event_hash, '|' ORDER BY created_at, id))
        FROM public.shift_events
        WHERE spec_version = '0' AND created_at < TIMESTAMPTZ '2026-06-04T02:56:50Z')
      AND a.expected_count = (
        SELECT count(*)
        FROM public.shift_events
        WHERE spec_version = '0' AND created_at < TIMESTAMPTZ '2026-06-04T02:56:50Z')
    ELSE NULL
  END AS matches,
  now() AS recomputed_at
FROM public.substrate_anchors a;

COMMENT ON VIEW public.v_anchor_verification IS
  'Per-anchor live recomputation. Used by FLOS-SHA-001 daily anchor check. matches=true => GREEN, false => RED. NULL matches => anchor id has no inline formula in this DDL (add one).';

-- Restrict the view to authenticated reads via grant control — the
-- view itself enforces no additional policy, but only authenticated
-- and service_role should ever see it.
REVOKE ALL ON public.v_anchor_verification FROM PUBLIC;
GRANT SELECT ON public.v_anchor_verification TO authenticated;
GRANT SELECT ON public.v_anchor_verification TO service_role;

-- FLOS-SHA-001 anchor_fingerprint check_name — extend the
-- substrate_health_log enum so the daily run can record this check.
ALTER TABLE public.substrate_health_log DROP CONSTRAINT IF EXISTS substrate_health_log_check_name_check;
ALTER TABLE public.substrate_health_log
  ADD CONSTRAINT substrate_health_log_check_name_check
  CHECK (check_name = ANY (ARRAY[
    'chain_integrity_shift_events'::text,
    'chain_integrity_auth_events'::text,
    'advisor_sweep'::text,
    'webhook_delivery_twilio'::text,
    'webhook_delivery_stripe'::text,
    'webhook_delivery_supabase_auth'::text,
    'cron_health'::text,
    'error_rate'::text,
    'anchor_fingerprint'::text                    -- M3 addition
  ]));