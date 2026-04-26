-- GAP-A3-002 — add workers.user_id so /api/field/* routes can derive
-- the worker record from the authenticated Supabase session instead
-- of trusting a client-supplied worker_id or phone value.
--
-- Nullable because existing worker rows have no Supabase user attached
-- yet. On first phone-OTP sign-in, the field-session bootstrap route
-- will upsert this column.

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workers_user_id ON workers(user_id) WHERE user_id IS NOT NULL;
