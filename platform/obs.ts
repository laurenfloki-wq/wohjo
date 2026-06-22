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
