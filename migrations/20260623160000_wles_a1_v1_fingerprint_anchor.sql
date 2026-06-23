-- A1 / WLES — v1 population fingerprint anchor (work-order item #5).
--
-- THE GAP: the live v1 chain has a COUNT anchor (wles_v1_watermark +
-- chain_count_anchor) and per-event chain validation, but NO fingerprint
-- anchor. The frozen v0 set (FROZEN_ANCHOR_V0) is fingerprint-anchored; v1 is
-- not. The count watermark catches tail truncation; per-event chain-verify
-- catches a single-event edit; but a full-DB-access actor who rewrites a tail
-- payload AND re-links the chain forward produces a perfectly self-consistent
-- chain that count + linkage both accept. A fingerprint bound to the ORIGINAL
-- event_hash set is what makes that rewrite RED.
--
-- THE ANCHOR: mirror FROZEN_ANCHOR_V0 exactly — an md5 roll-up over
-- (id : event_hash) pairs, recomputed INLINE in v_anchor_verification (never
-- ad-hoc), bound over a frozen PREFIX of the v1 population. v1 is a live,
-- growing chain, so (like v0) we freeze a prefix up to a cutoff; events after
-- the cutoff are covered by the count watermark + chain-verify and folded into
-- a later anchor when this one is advanced (a deliberate, signed migration —
-- the same forcing function v0 uses).
--
-- PREFIX: spec_version='1.0' AND wles_event IS NOT NULL AND created_at <
--         '2026-06-19T00:00:00Z' (the current full v1 set: 15 events, 1
--         company; latest live event 2026-06-18T03:18:35Z).
--
-- BOUND VALUES — computed from live prod 2026-06-23 and INDEPENDENTLY verified
-- before binding:
--   expected_count       = 15
--   expected_fingerprint = ef655a3e618c4f295c4e6f2eb3b42360
--   precondition checks (all true at bind time): every row's projection
--   event_hash == wles_event.event_hash; every event_hash is well-formed
--   64-hex; chain_count_anchor + chain validation + shift_commit_completeness
--   all GREEN. Binding therefore freezes a verified-correct state as canonical.
--
-- anchor_fingerprint wiring is automatic: the substrate-health check selects
-- every v_anchor_verification row — matches=false → RED, matches IS NULL →
-- ERROR. So the INSERT below must be accompanied by the view CASE branch or the
-- check goes ERROR (the intended "two places" forcing function).

INSERT INTO public.substrate_anchors
  (id, scope_text, formula_text, expected_fingerprint, expected_count, bound_at)
VALUES (
  'FROZEN_ANCHOR_V1',
  E'shift_events WHERE spec_version=''1.0'' AND wles_event IS NOT NULL AND created_at < ''2026-06-19T00:00:00Z''',
  E'md5(string_agg(id::text || '':'' || event_hash, ''|'' ORDER BY created_at, id))',
  'ef655a3e618c4f295c4e6f2eb3b42360',
  15,
  '2026-06-19T00:00:00Z'
) ON CONFLICT (id) DO NOTHING;

-- Extend v_anchor_verification with the v1 prefix branch alongside v0.
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
    WHEN 'FROZEN_ANCHOR_V1' THEN
      (SELECT md5(string_agg(id::text || ':' || event_hash, '|' ORDER BY created_at, id))
       FROM public.shift_events
       WHERE spec_version = '1.0' AND wles_event IS NOT NULL
         AND created_at < TIMESTAMPTZ '2026-06-19T00:00:00Z')
    ELSE NULL
  END AS actual_fingerprint,
  CASE a.id
    WHEN 'FROZEN_ANCHOR_V0' THEN
      (SELECT count(*)::integer
       FROM public.shift_events
       WHERE spec_version = '0' AND created_at < TIMESTAMPTZ '2026-06-04T02:56:50Z')
    WHEN 'FROZEN_ANCHOR_V1' THEN
      (SELECT count(*)::integer
       FROM public.shift_events
       WHERE spec_version = '1.0' AND wles_event IS NOT NULL
         AND created_at < TIMESTAMPTZ '2026-06-19T00:00:00Z')
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
    WHEN 'FROZEN_ANCHOR_V1' THEN
      a.expected_fingerprint = (
        SELECT md5(string_agg(id::text || ':' || event_hash, '|' ORDER BY created_at, id))
        FROM public.shift_events
        WHERE spec_version = '1.0' AND wles_event IS NOT NULL
          AND created_at < TIMESTAMPTZ '2026-06-19T00:00:00Z')
      AND a.expected_count = (
        SELECT count(*)
        FROM public.shift_events
        WHERE spec_version = '1.0' AND wles_event IS NOT NULL
          AND created_at < TIMESTAMPTZ '2026-06-19T00:00:00Z')
    ELSE NULL
  END AS matches,
  now() AS recomputed_at
FROM public.substrate_anchors a;

COMMENT ON VIEW public.v_anchor_verification IS
  'Per-anchor live recomputation (FROZEN_ANCHOR_V0 + FROZEN_ANCHOR_V1). Used by the anchor_fingerprint daily check. matches=true => GREEN, false => RED, NULL => anchor id has no inline formula in this DDL (add one).';
