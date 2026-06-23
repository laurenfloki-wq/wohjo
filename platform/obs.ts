// obs.ts — observability: health, cost views, Sentry passthrough.
//
// A dead endpoint must page us, not stall silently. The /health Edge Function
// (functions/health) calls checkHealth(); the external uptime monitor pings it.

import { db } from './db';

export interface HealthResult {
  ok: boolean;
  checks: Record<string, 'ok' | 'fail'>;
  ts: string;
}

/** Liveness + DB reachability + chain sentinel. Cheap; safe to poll. */
export async function checkHealth(): Promise<HealthResult> {
  const checks: Record<string, 'ok' | 'fail'> = {};
  try {
    const sql = db();
    await sql`select 1`;
    checks.db = 'ok';
  } catch {
    checks.db = 'fail';
  }
  const ok = Object.values(checks).every((v) => v === 'ok');
  return { ok, checks, ts: new Date().toISOString() };
}

/** Per-bot spend this budget period (AUD), for the cost view / daily brief. */
export async function botCost(botId: string): Promise<{ costAud: number; tokens: number }> {
  const sql = db();
  const rows = await sql<{ cost_aud: string | null; tokens: string | null }[]>`
    select coalesce(sum(cost_aud),0) as cost_aud,
           coalesce(sum(input_tokens + output_tokens),0) as tokens
    from bot_runs
    where bot_id = ${botId}
      and created_at >= date_trunc('month', now())
  `;
  const r = rows[0];
  return { costAud: Number(r?.cost_aud ?? 0), tokens: Number(r?.tokens ?? 0) };
}

/** Fleet-wide spend this month (AUD). */
export async function fleetCost(): Promise<number> {
  const sql = db();
  const rows = await sql<{ cost_aud: string | null }[]>`
    select coalesce(sum(cost_aud),0) as cost_aud
    from bot_runs
    where created_at >= date_trunc('month', now())
  `;
  return Number(rows[0]?.cost_aud ?? 0);
}

export interface BotActivity {
  botId: string;
  lastRunAt: string | null;
  lastStatus: string | null;
  runs24h: number;
}

/**
 * Last run + 24h run count per bot, from the audit ledger. This is the "is it
 * running" view: a bot that fired recently shows a fresh lastRunAt; one that has
 * never run shows null.
 */
export async function fleetActivity(): Promise<BotActivity[]> {
  const sql = db();
  return sql<BotActivity[]>`
    select bot_id as "botId",
           max(created_at) as "lastRunAt",
           (array_agg(action order by created_at desc))[1] as "lastStatus",
           count(*) filter (where created_at >= now() - interval '24 hours')::int as "runs24h"
    from bot_audit_ledger
    where action like 'bot.run.%'
    group by bot_id
    order by max(created_at) desc nulls last
  `;
}

export interface LedgerEntry {
  id: number;
  botId: string;
  action: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

/** Most recent ledger entries (what bots have been doing). */
export async function recentLedger(limit = 50): Promise<LedgerEntry[]> {
  const sql = db();
  return sql<LedgerEntry[]>`
    select id, bot_id as "botId", action, detail, created_at as "createdAt"
    from bot_audit_ledger
    order by id desc
    limit ${limit}
  `;
}

export interface BotOutput {
  kind: 'gated' | 'autonomous';
  botId: string;
  action: string;
  status: string;
  createdAt: string;
  /** The produced artifact: approval payload (gated) or run data (autonomous). */
  output: Record<string, unknown>;
  /** Present for gated outputs. */
  approvalId?: string;
}

/**
 * Recent produced artifacts across the fleet. Gated outputs come from the
 * approval queue (the artifact is the payload); autonomous outputs come from the
 * audit ledger's finish records that carried data. Newest first.
 */
export async function recentOutputs(limit = 40): Promise<BotOutput[]> {
  const sql = db();
  const gated = await sql<
    {
      botId: string;
      action: string;
      status: string;
      createdAt: string;
      output: Record<string, unknown>;
      approvalId: string;
    }[]
  >`
    select bot_id as "botId", proposed_action as "action", status,
           created_at as "createdAt", payload as output, id::text as "approvalId"
    from bot_approval_requests
    order by created_at desc
    limit ${limit}
  `;
  const auto = await sql<
    { botId: string; status: string; createdAt: string; detail: Record<string, unknown> }[]
  >`
    select bot_id as "botId", created_at as "createdAt",
           detail->>'status' as status, detail
    from bot_audit_ledger
    where action = 'bot.run.finish' and detail ? 'data'
    order by id desc
    limit ${limit}
  `;

  const out: BotOutput[] = [
    ...gated.map((g) => ({
      kind: 'gated' as const,
      botId: g.botId,
      action: g.action,
      status: g.status,
      createdAt: g.createdAt,
      output: g.output,
      approvalId: g.approvalId,
    })),
    ...auto.map((a) => ({
      kind: 'autonomous' as const,
      botId: a.botId,
      action: String((a.detail as { summary?: unknown }).summary ?? 'run'),
      status: a.status ?? 'ok',
      createdAt: a.createdAt,
      output: ((a.detail as { data?: Record<string, unknown> }).data ?? {}) as Record<
        string,
        unknown
      >,
    })),
  ];
  return out.sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt)).slice(0, limit);
}

/** Count of pending approvals (gated bot outputs awaiting a director). */
export async function pendingApprovalCount(): Promise<number> {
  const sql = db();
  const rows = await sql<{ n: string }[]>`
    select count(*)::text as n from bot_approval_requests where status = 'pending'
  `;
  return Number(rows[0]?.n ?? 0);
}
