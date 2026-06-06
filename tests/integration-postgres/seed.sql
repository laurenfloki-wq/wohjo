-- ────────────────────────────────────────────────────────────────────
-- FLOSTRUCTION integration harness seed
-- ────────────────────────────────────────────────────────────────────
-- Seeds the minimum tenant scaffolding + the two forensic anomaly
-- rows so the bulletproof scenarios run against a substrate that
-- mirrors the live shape (anomaly rows preserved, never mutated).

-- ─── Tenant scaffolding ────────────────────────────────────────────
INSERT INTO companies (id, name) VALUES
  ('00000000-1000-0000-0000-000000000001', 'FLOSTRUCTION Test Tenant');

INSERT INTO sites (id, company_id, name) VALUES
  ('00000000-3000-0000-0000-000000000001',
   '00000000-1000-0000-0000-000000000001', 'Mt Stromlo Observatory');

INSERT INTO workers (id, company_id, first_name, last_name, phone, employee_id, is_active)
VALUES
  ('00000000-2000-0000-0000-000000000001',
   '00000000-1000-0000-0000-000000000001',
   'Joao', 'Muniz Campos', '+61400000001', 'EMP-001', true);

INSERT INTO admins (user_id, company_id, role) VALUES
  ('fb9110c8-bea7-4fc4-8a1e-7c3bc45c71c7',
   '00000000-1000-0000-0000-000000000001', 'director'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
   '00000000-1000-0000-0000-000000000001', 'payroll_officer'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
   '00000000-1000-0000-0000-000000000001', 'viewer'),
  -- Non-owner of the tenant — used to prove RLS bites.
  ('ffffffff-ffff-4fff-8fff-ffffffffffff',
   '00000000-1000-0000-0000-000000000001', 'site_supervisor');

INSERT INTO substrate_anchors
  (id, scope_text, formula_text, expected_fingerprint, expected_count, bound_at)
VALUES (
  'FROZEN_ANCHOR_V0',
  E'shift_events WHERE spec_version=''0'' AND created_at < ''2026-06-04T02:56:50Z''',
  E'md5(string_agg(id::text || '':'' || event_hash, ''|'' ORDER BY created_at, id))',
  '8e6d4af90792eadb47f9205fe18e6325',
  32, '2026-06-04T02:56:50Z'
);

-- ─── Pre-cutover anchor seed: one synthetic v0 START_EVENT so the
-- chain has a tail that subsequent v0 events can link to. The
-- harness's anchor fingerprint is recomputed over whatever the
-- seeded v0 rows are; it is NOT the production '8e6d4af9...' value.
-- ──────────────────────────────────────────────────────────────────
INSERT INTO shift_events (
  id, company_id, worker_id, site_id, event_type, event_data,
  event_hash, previous_event_hash, created_by, spec_version, created_at
) VALUES (
  '00000000-7000-0000-0000-00000000a001',
  '00000000-1000-0000-0000-000000000001',
  '00000000-2000-0000-0000-000000000001',
  '00000000-3000-0000-0000-000000000001',
  'START_EVENT',
  '{}'::jsonb,
  'a000000000000000000000000000000000000000000000000000000000000001',
  NULL, 'seed:harness', '0', '2026-04-30T20:55:46.881Z'
);

-- ─── M2-shape anomaly seed: two post-cutover v0 rows that mirror
-- the forensic rows from production. Both must be preserved
-- unmutated and remain readable. The post_cutover constraint is
-- NOT VALID so these rows are accepted at INSERT time during the
-- bootstrap (and never re-checked because we never UPDATE them).
-- ──────────────────────────────────────────────────────────────────
INSERT INTO shift_events (
  id, company_id, worker_id, site_id, event_type, event_data,
  event_hash, previous_event_hash, created_by, spec_version, created_at
) VALUES (
  'd6249c3a-9fe9-458c-87c0-b396f8af09c2',
  '00000000-1000-0000-0000-000000000001',
  '00000000-2000-0000-0000-000000000001',
  '00000000-3000-0000-0000-000000000001',
  'PAYROLL_APPROVAL',
  jsonb_build_object('shift_id', 'anomaly-1', 'receipt_id', 'FSTR-ANOM01'),
  'd86404dc70fa0a039835c438bf75f9c463fd71e76d0f56d175511e2f8e9cb3c1',
  'a000000000000000000000000000000000000000000000000000000000000001',
  'seed:anomaly', '0', '2026-06-05T04:18:52.419Z'
),
(
  'e22ee9fd-5c89-45fe-a264-ba928ab6b01f',
  '00000000-1000-0000-0000-000000000001',
  '00000000-2000-0000-0000-000000000001',
  '00000000-3000-0000-0000-000000000001',
  'EXPORT_RECORD',
  jsonb_build_object('shift_id', 'anomaly-1'),
  '92fbeca77eab1576436ee0eaf57ebaed2102fdd5f3f52275a34f1bae4e62e0d2',
  'd86404dc70fa0a039835c438bf75f9c463fd71e76d0f56d175511e2f8e9cb3c1',
  'seed:anomaly', '0', '2026-06-05T04:19:10.049Z'
);

-- ─── Bridge + annotation (v1, post-cutover) ────────────────────────
INSERT INTO shift_events (
  id, company_id, worker_id, site_id, event_type, event_data,
  event_hash, previous_event_hash, created_by, spec_version, wles_event, created_at
) VALUES (
  '4cadc05c-7679-42a0-b090-b2775f443187',
  '00000000-1000-0000-0000-000000000001',
  NULL, NULL,
  'X-FLOSMOSIS-SPEC_VERSION_MIGRATION', '{}'::jsonb,
  'ec801f172bbf53da26bc6d6b153e0d30b32d146051063e56469ad9c47a764fbd',
  '0000000000000000000000000000000000000000000000000000000000000000',
  'seed:bridge', '1.0',
  jsonb_build_object('event_type','X-FLOSMOSIS-SPEC_VERSION_MIGRATION','payload',jsonb_build_object('from_spec_version','0','to_spec_version','1.0')),
  '2026-06-04T02:56:50.920163Z'
);

-- ─── Post-seed: install shift_events_post_cutover_spec_v1 NOT VALID.
-- Done here (not in bootstrap) because NOT VALID only skips the
-- back-scan over existing rows — every subsequent INSERT/UPDATE is
-- still checked, so this would have rejected the anomaly seed above
-- if installed at bootstrap time. After this point, any v0 INSERT at
-- created_at >= cutover is rejected (Defect B's substrate guard).
ALTER TABLE shift_events ADD CONSTRAINT shift_events_post_cutover_spec_v1
  CHECK (NOT (created_at >= TIMESTAMPTZ '2026-06-04T02:56:50Z'
              AND spec_version = '0'))
  NOT VALID;
