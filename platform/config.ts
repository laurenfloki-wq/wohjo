// config.ts — per-bot enable + global kill switch reads (deterministic).
// Used by the runtime to gate every bot run, not just LLM calls.

import { db } from './db';
import type { BotId } from './types';

export class FleetHaltedError extends Error {
  constructor() {
    super('Global kill switch is engaged; fleet halted.');
    this.name = 'FleetHaltedError';
  }
}

export class BotDisabledError extends Error {
  constructor(botId: string) {
    super(`Bot ${botId} is disabled.`);
    this.name = 'BotDisabledError';
  }
}

/**
 * Throws FleetHaltedError if the global kill switch is off, or BotDisabledError
 * if this bot is disabled. A bot with no config row is treated as enabled
 * (config rows are seeded lazily; absence is not "disabled").
 */
export async function assertBotEnabled(botId: BotId): Promise<void> {
  const sql = db();
  const rows = await sql<{ bot_id: string; enabled: boolean }[]>`
    select bot_id, enabled from bot_config where bot_id in ('__global__', ${botId})
  `;
  const global = rows.find((r) => r.bot_id === '__global__');
  if (global && !global.enabled) throw new FleetHaltedError();
  const cfg = rows.find((r) => r.bot_id === botId);
  if (cfg && !cfg.enabled) throw new BotDisabledError(botId);
}
