// wiring.ts — helpers shared by registry entries so each bot's adapter stays tiny.

import { requestApproval } from '../platform/hitl';
import { record } from '../platform/audit';
import { env } from '../platform/env';
import { InputUnavailable, type BotContext, type RunResult } from './runtime';
import type { GateTier } from '../platform/types';

/**
 * Resolve a bot's input: prefer an explicit payload (manual POST / replay); else
 * pull from the connector when its secret is present; else raise InputUnavailable
 * so the schedule keeps firing and the gap is audited. This is the self-feed seam.
 */
export async function loadVia<T>(
  ctx: BotContext,
  key: string,
  connector: string,
  secretEnv: string,
  loader: () => Promise<T>,
): Promise<T> {
  const provided = ctx.input[key];
  if (provided !== undefined && provided !== null) return provided as T;
  if (!env(secretEnv)) throw new InputUnavailable(connector);
  return loader();
}

/**
 * Read a required input object from the context (manual POST body / cron payload).
 * If absent, raise InputUnavailable naming the connector that would supply it on
 * a live schedule. This is what makes a bot usable now (POST the data) and
 * fully autonomous later (connector feeds the same shape).
 */
export function requireInput<T>(ctx: BotContext, key: string, connector: string): T {
  const v = ctx.input[key];
  if (v === undefined || v === null) throw new InputUnavailable(connector);
  return v as T;
}

/**
 * Finalise a run by gate tier. T0/T1 are autonomous (logged / notify-after); T2/T3
 * write an approval request and return a gated result — the side-effect is never
 * fired here.
 */
export async function settle(
  botId: string,
  gate: GateTier,
  proposedAction: string,
  payload: Record<string, unknown>,
  data?: Record<string, unknown>,
): Promise<RunResult> {
  const result: RunResult = { status: 'ok', summary: proposedAction };
  if (data !== undefined) result.data = data;
  if (gate === 'T2' || gate === 'T3') {
    const { id } = await requestApproval({ botId, tier: gate, payload, proposedAction });
    return { ...result, status: 'gated', approvalId: id };
  }
  if (gate === 'T1') {
    await record({ botId, action: 'bot.notify', detail: { proposedAction } });
  }
  return result;
}
