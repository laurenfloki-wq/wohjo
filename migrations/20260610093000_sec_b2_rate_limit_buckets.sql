-- Security remediation B(ii) — durable rate limiting (2026-06-10)
--
-- The in-memory limiter in src/lib/security/rate-limit.ts resets per
-- serverless cold start and is not shared across instances, so the
-- effective limit was "N per warm instance", not global. This adds a
-- Postgres-backed bucket store + atomic upsert-and-count function used
-- as the durable backstop behind the in-memory L1 fast-path.
--
-- Idempotent. Reversible (see bottom).

create table if not exists public.rate_limit_buckets (
  key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null
);

comment on table public.rate_limit_buckets is
  'Durable rate-limit buckets (finding B-ii). Service-role only: RLS enabled, no policies.';

-- Service-role-only: RLS enabled with NO policies means anon/authenticated
-- are denied; service role bypasses RLS by design.
alter table public.rate_limit_buckets enable row level security;

create or replace function public.check_rate_limit(
  p_key text,
  p_window_ms int,
  p_max int
)
returns table (allowed boolean, remaining int, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count int;
  v_reset timestamptz;
begin
  insert into rate_limit_buckets as b (key, count, reset_at)
  values (p_key, 1, v_now + make_interval(secs => p_window_ms / 1000.0))
  on conflict (key) do update
    set count = case when b.reset_at < v_now then 1 else b.count + 1 end,
        reset_at = case when b.reset_at < v_now
                        then v_now + make_interval(secs => p_window_ms / 1000.0)
                        else b.reset_at end
  returning b.count, b.reset_at into v_count, v_reset;

  return query select v_count <= p_max, greatest(p_max - v_count, 0), v_reset;
end;
$$;

revoke execute on function public.check_rate_limit(text, int, int)
  from public, anon, authenticated;

-- Opportunistic cleanup helper (service-role cron may call this; optional).
create or replace function public.cleanup_rate_limit_buckets()
returns void
language sql
security definer
set search_path = public
as $$
  delete from rate_limit_buckets where reset_at < now() - interval '10 minutes';
$$;

revoke execute on function public.cleanup_rate_limit_buckets()
  from public, anon, authenticated;

-- Rollback:
--   drop function if exists public.cleanup_rate_limit_buckets();
--   drop function if exists public.check_rate_limit(text, int, int);
--   drop table if exists public.rate_limit_buckets;
