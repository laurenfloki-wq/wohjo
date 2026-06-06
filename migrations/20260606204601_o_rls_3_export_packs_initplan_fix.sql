-- O_RLS_3 — wrap auth.uid() in a scalar subquery on
-- export_packs_select_company_admins. Per the Supabase performance
-- advisor (auth_rls_initplan), referencing auth.uid() bare causes
-- the policy expression to re-execute per row. Wrapping in
-- (select auth.uid()) lets Postgres evaluate once and reuse.
--
-- Access semantics MUST remain identical: admin of the export's
-- company can SELECT its export_packs; non-owners cannot. Proven
-- by the integration harness in tests/integration-postgres/.

DROP POLICY IF EXISTS export_packs_select_company_admins
  ON public.export_packs;

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
        AND a.user_id = (select auth.uid())
    )
  );
