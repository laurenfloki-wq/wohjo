-- M4-E — Phase 1 §3a substrate: export_packs + exports widening +
-- private storage buckets + RLS. Per the corrected proposal.
--
-- export_packs holds the 1:1 metadata per export operation: the
-- canonical JCS manifest, its SHA-256 fingerprint, the paths and
-- hashes of the two stored artefacts (payroll-import file +
-- Evidence Pack PDF), and a permanent UNIQUE idempotency_key so
-- replays return the prior pack without minting new rows.
--
-- exports widens to point at the pack and to carry path/MIME of the
-- payroll-import artefact. The legacy audit_pack_url column stays
-- for backwards compatibility; new code reads
-- export_packs.audit_pack_storage_path.

CREATE TABLE public.export_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  export_id uuid REFERENCES public.exports(id) ON DELETE SET NULL,
  pack_format_version text NOT NULL DEFAULT 'pack-v1.0',
  canonical_manifest_jsonb jsonb NOT NULL,
  pack_fingerprint text NOT NULL CHECK (pack_fingerprint ~ '^[0-9a-f]{64}$'),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[0-9a-f]{64}$'),
  payroll_file_storage_path text NOT NULL,
  payroll_file_mime text NOT NULL,
  payroll_file_hash text NOT NULL CHECK (payroll_file_hash ~ '^[0-9a-f]{64}$'),
  audit_pack_storage_path text NOT NULL,
  audit_pack_mime text NOT NULL DEFAULT 'application/pdf',
  audit_pack_hash text NOT NULL CHECK (audit_pack_hash ~ '^[0-9a-f]{64}$'),
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid
);

COMMENT ON TABLE public.export_packs IS
  'Per-export pack metadata: canonical JCS manifest, pack fingerprint over the manifest bytes, paths + hashes of the two stored artefacts (payroll import file, Evidence Pack PDF), and a permanent UNIQUE idempotency_key. Append-only by convention; SELECT scoped to admins of the export company, all writes service-role.';

COMMENT ON COLUMN public.export_packs.pack_fingerprint IS
  'SHA-256 over the canonical (RFC 8785 JCS) bytes of canonical_manifest_jsonb. Stable identifier used by the public /verify/pack/[fingerprint] surface.';

COMMENT ON COLUMN public.export_packs.idempotency_key IS
  'sha256(company_id|pay_period_start|pay_period_end|sorted(shift_ids)|export_target). PERMANENT — lives on this table, NEVER pruned. Replays return the prior pack_id via ON CONFLICT (idempotency_key) DO NOTHING RETURNING id.';

CREATE UNIQUE INDEX export_packs_idempotency_key_idx ON public.export_packs (idempotency_key);
CREATE UNIQUE INDEX export_packs_pack_fingerprint_idx ON public.export_packs (pack_fingerprint);
CREATE INDEX export_packs_export_id_idx ON public.export_packs (export_id);

-- RLS — directors + payroll_officers + viewers of the export's
-- company can SELECT. All INSERT/UPDATE/DELETE happens from the
-- export route under the service-role client.
ALTER TABLE public.export_packs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS export_packs_select_company_admins ON public.export_packs;
CREATE POLICY export_packs_select_company_admins
  ON public.export_packs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.exports e
      JOIN public.admins a ON a.company_id = e.company_id
      WHERE e.id = export_packs.export_id
        AND a.user_id = auth.uid()
    )
  );

-- ─── exports widening ─────────────────────────────────────────────
ALTER TABLE public.exports
  ADD COLUMN IF NOT EXISTS pack_id uuid REFERENCES public.export_packs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payroll_file_storage_path text,
  ADD COLUMN IF NOT EXISTS payroll_file_mime text;

COMMENT ON COLUMN public.exports.pack_id IS
  'Points at the export_packs row that carries the canonical manifest, fingerprint, and artefact paths. NULL on the 2 historical rows; populated on every new export.';

COMMENT ON COLUMN public.exports.payroll_file_storage_path IS
  'M4: path in the flos-exports-private Storage bucket. Convention: payroll/{company_id}/{pay_period}/payroll-{pack_fingerprint}.{xlsx|csv}.';

COMMENT ON COLUMN public.exports.payroll_file_mime IS
  'M4: MIME of the stored payroll-import file. Set by the export route alongside payroll_file_storage_path.';

CREATE INDEX IF NOT EXISTS exports_pack_id_idx ON public.exports (pack_id);

-- ─── Storage buckets ─────────────────────────────────────────────
-- Both PRIVATE. Names short and lowercase per Supabase conventions.
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('flos-exports-private', 'flos-exports-private', false),
  ('audit-packs',          'audit-packs',          false)
ON CONFLICT (id) DO NOTHING;

-- ─── storage.objects RLS — restrict bucket access to admins of the
-- owning company. Path convention: <bucket>/<company_id>/...
-- The company_id is the first path segment (split_part(name,'/',1)).
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS exports_bucket_select_company_admins ON storage.objects;
CREATE POLICY exports_bucket_select_company_admins
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id IN ('flos-exports-private','audit-packs')
    AND EXISTS (
      SELECT 1 FROM public.admins a
      WHERE a.user_id = auth.uid()
        AND a.company_id::text = split_part(name, '/', 1)
    )
  );

-- No INSERT/UPDATE/DELETE policy is created — uploads happen from
-- the export route under the service-role client (which bypasses
-- RLS), and there is no admin self-serve write path. A future
-- self-serve UI surface MUST add an explicit policy.