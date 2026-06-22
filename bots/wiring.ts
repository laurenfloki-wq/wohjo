// wiring.ts — helpers shared by registry entries so each bot's adapter stays tiny.

import { requestApproval } from '../platform/hitl';
import { record } from '../platform/audit';
import { InputUnavailable, type BotContext, type RunResult } from './runtime';
import type { GateTier } from '../platform/types';

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
