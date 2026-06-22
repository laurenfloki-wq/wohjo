-- FLOSMOSIS Bot Fleet — core platform schema.
-- Isolated from the product's /migrations: every table is prefixed bot_.
-- Idempotent: safe to re-run (CREATE ... IF NOT EXISTS, guarded DO blocks).

-- Extensions (no-ops if already enabled by the product).
create extension if not exists pgcrypto;
create extension if not exists vector;
create extension if not exists pg_cron;
create extension if not exists pgmq;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- bot_audit_ledger — append-only, hash-chained. UPDATE/DELETE revoked.
-- Every consequential bot action and every human approval writes one row.
-- ---------------------------------------------------------------------------
create table if not exists bot_audit_ledger (
  id            bigint generated always as identity primary key,
  bot_id        text        not null,
  action        text        not null,
  detail        jsonb       not null default '{}'::jsonb,
  idempotency_key text,
  created_at    timestamptz not null default now(),
  prev_hash     text,
  row_hash      text        not null
);

-- Hash chain: row_hash = sha256(prev_hash || canonical payload). Computed in a
-- BEFORE INSERT trigger so application code cannot forge or skip it.
create or replace function bot_audit_chain()
returns trigger
language plpgsql
as $$
declare
  v_prev text;
  v_payload text;
begin
  select row_hash into v_prev
  from bot_audit_ledger
  order by id desc
  limit 1;

  new.prev_hash := v_prev;
  v_payload := coalesce(v_prev, '') || '|' ||
               new.bot_id || '|' ||
               new.action || '|' ||
               coalesce(new.idempotency_key, '') || '|' ||
               new.detail::text || '|' ||
               new.created_at::text;
  new.row_hash := encode(digest(v_payload, 'sha256'), 'hex');
  return new;
end;
$$;

drop trigger if exists trg_bot_audit_chain on bot_audit_ledger;
create trigger trg_bot_audit_chain
  before insert on bot_audit_ledger
  for each row execute function bot_audit_chain();

-- Append-only: block UPDATE and DELETE for every role (including the table
-- owner path used by app roles). Revoke + a hard trigger belt-and-braces.
revoke update, delete on bot_audit_ledger from public;

create or replace function bot_audit_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'bot_audit_ledger is append-only; % is not permitted', tg_op;
end;
$$;

drop trigger if exists trg_bot_audit_immutable on bot_audit_ledger;
create trigger trg_bot_audit_immutable
  before update or delete on bot_audit_ledger
  for each row execute function bot_audit_immutable();

-- ---------------------------------------------------------------------------
-- bot_config — per-bot enable + budget, plus the GLOBAL kill switch row.
-- The kill switch is the sentinel bot_id '__global__'.
-- ---------------------------------------------------------------------------
create table if not exists bot_config (
  bot_id                  text primary key,
  enabled                 boolean     not null default true,
  monthly_token_budget    bigint      not null default 1000000,
  tokens_used_this_month  bigint      not null default 0,
  budget_period           date        not null default date_trunc('month', now())::date,
  notes                   text,
  updated_at              timestamptz not null default now()
);

insert into bot_config (bot_id, enabled, monthly_token_budget, notes)
values ('__global__', true, 0, 'Global kill switch. enabled=false halts the entire fleet.')
on conflict (bot_id) do nothing;

-- ---------------------------------------------------------------------------
-- bot_runs — token + AUD cost accounting per LLM call.
-- ---------------------------------------------------------------------------
create table if not exists bot_runs (
  id              bigint generated always as identity primary key,
  bot_id          text        not null,
  task_class      text        not null,
  model           text        not null,
  input_tokens    integer     not null default 0,
  output_tokens   integer     not null default 0,
  cached_tokens   integer     not null default 0,
  cost_aud        numeric(12,6) not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists idx_bot_runs_bot_created on bot_runs (bot_id, created_at desc);

-- ---------------------------------------------------------------------------
-- bot_idempotency_keys — claim-once table for idempotent handlers.
-- ---------------------------------------------------------------------------
create table if not exists bot_idempotency_keys (
  key         text        primary key,
  bot_id      text        not null,
  claimed_at  timestamptz not null default now(),
  result      jsonb
);

-- ---------------------------------------------------------------------------
-- bot_approval_requests — the approval queue (gate tiers T2/T3).
-- ---------------------------------------------------------------------------
create table if not exists bot_approval_requests (
  id              uuid        primary key default gen_random_uuid(),
  bot_id          text        not null,
  tier            text        not null check (tier in ('T0','T1','T2','T3')),
  status          text        not null default 'pending'
                    check (status in ('pending','approved','rejected','expired')),
  payload         jsonb       not null default '{}'::jsonb,
  proposed_action text        not null,
  parked_queue    text,
  parked_msg_id   bigint,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz,
  resolved_at     timestamptz,
  resolved_by     text
);
create index if not exists idx_bot_approvals_pending
  on bot_approval_requests (created_at)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- bot_kb_chunks — pgvector knowledge base for grounded answers.
-- 1536 dims (text-embedding-3-small compatible); adjust per embedder.
-- ---------------------------------------------------------------------------
create table if not exists bot_kb_chunks (
  id          uuid        primary key default gen_random_uuid(),
  source_id   text        not null,
  source_kind text        not null,
  content     text        not null,
  embedding   vector(1536),
  metadata    jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_bot_kb_source on bot_kb_chunks (source_id);
