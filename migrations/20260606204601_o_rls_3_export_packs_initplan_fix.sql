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