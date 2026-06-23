-- Fleet hardening: deny-by-default RLS on every bot_ table so they are NOT
-- reachable via Supabase's auto REST API (anon/authenticated). The fleet itself
-- connects with the service role over DATABASE_URL, which bypasses RLS, so no
-- policies are needed for it to work. Also creates the durable bookkeeping queue.

alter table bot_audit_ledger        enable row level security;
alter table bot_config              enable row level security;
alter table bot_runs                enable row level security;
alter table bot_idempotency_keys    enable row level security;
alter table bot_approval_requests   enable row level security;
alter table bot_kb_chunks           enable row level security;

-- No policies = no anon/authenticated access. Revoke table grants too.
revoke all on bot_audit_ledger, bot_config, bot_runs, bot_idempotency_keys,
  bot_approval_requests, bot_kb_chunks from anon, authenticated;

-- Durable money/evidence queue drained by the per-minute worker.
select pgmq.create('bookkeeping');
