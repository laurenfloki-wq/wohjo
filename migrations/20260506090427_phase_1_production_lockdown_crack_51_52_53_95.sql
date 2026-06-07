-- PHASE 1: Production Lockdown
-- Closes CRACK 51, 52, 53 (partial), 95
-- Authority: full per v4 remediation prompt PART A
-- Pre-verified: anon=X on both functions; anon_insert_founding_leads policy exists;
--   founding_leads has 0 rows; 0 violators of new CHECKs; 0 existing CHECKs

-- Closes CRACK 51, 95 (privilege escalation via SECURITY DEFINER + anon EXECUTE)
REVOKE EXECUTE ON FUNCTION public.provision_tenant_from_checkout(text, text, text, text, text, text, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;

-- Closes CRACK 52 (DoS via founding_spot allocation)
REVOKE EXECUTE ON FUNCTION public.allocate_founding_spot()
  FROM PUBLIC, anon, authenticated;

-- Closes CRACK 53 partial (drop the WITH CHECK (true) anon INSERT policy)
DROP POLICY IF EXISTS anon_insert_founding_leads ON public.founding_leads;

-- CRACK 53 holding-pattern CHECKs (note: founding_leads has no email column;
-- email constraint from PART E dropped. company_name CHECK only when NOT NULL.
-- phone is NOT NULL by table def so no NULL guard needed.)
ALTER TABLE public.founding_leads ADD CONSTRAINT founding_leads_company_name_length
  CHECK (company_name IS NULL OR length(company_name) BETWEEN 2 AND 200);

ALTER TABLE public.founding_leads ADD CONSTRAINT founding_leads_phone_format
  CHECK (phone ~ '^\+?[0-9]{8,15}$');