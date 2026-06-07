-- CRACK 215: UNIQUE constraint on workers.phone (normalised digits-only form)
-- Prevents duplicate worker rows with the same phone number. 
-- Normalisation strips non-digits so '+61451258610' and '61451258610' are caught as duplicates.
-- Note: does NOT handle '0451258610' vs '+61451258610' format variation — that's an
-- application-layer canonicalisation concern (future CRACK if needed). This index covers
-- the most common duplicate vector: same phone entered twice with different format prefix.
-- Pre-flight verified: zero duplicates in current data (single worker).

CREATE UNIQUE INDEX IF NOT EXISTS workers_phone_unique 
  ON public.workers (REGEXP_REPLACE(phone, '[^0-9]', '', 'g'))
  WHERE phone IS NOT NULL;