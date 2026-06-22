// runtime.ts — the uniform fleet runtime. Every bot is invoked through here, so
// gating (kill switch + enable), audit, and error capture are consistent.

import { record } from '../platform/audit';
import { assertBotEnabled } from '../platform/config';
import { botLogger } from '../platform/log';
import type { GateTier } from '../platform/types';

export type BotTrigger =
  | 'schedule' // cron -> /api/fleet/run/<id>
  | 'http' // on-demand POST
  | 'webhook' // provider webhook -> enqueue -> worker
  | 'inline' // library only, no own trigger
  | 'github_actions'; // runs in CI

/** Raised by a bot's run when a required external connector/secret is absent. */
export class InputUnavailable extends Error {
  readonly needs: string;
  constructor(needs: string) {
    super(`awaiting input source: ${needs}`);
    this.name = 'InputUnavailable';
    this.needs = needs;
  }
}

export interface BotContext {
  /** Manual/cron payload (query or JSON body), if any. */
  input: Record<string, unknown>;
  /** 'cron' | 'manual' | 'webhook'. */
  invokedBy: string;
}

export interface RunResult {
  status: 'ok' | 'gated' | 'awaiting_input' | 'skipped';
  summary: string;
  /** Approval id when the run produced a gated artefact. */
  approvalId?: string;
  data?: Record<string, unknown>;
}

export interface BotModule {
  id: string;
  trigger: BotTrigger;
  gate: GateTier;
  /** Cron expression for scheduled bots (also registered in vercel.json). */
  schedule?: string;
  run(ctx: BotContext): Promise<RunResult>;
}

/**
 * Execute a bot module with uniform gating + audit. Returns a RunResult; never
 * throws for InputUnavailable (that is an expected, audited state while a
 * connector/secret is pending).
 */
export async function runBot(mod: BotModule, ctx: BotContext): Promise<RunResult> {
  const log = botLogger(mod.id);
  try {
    await assertBotEnabled(mod.id);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log.warn({ reason }, 'bot.skipped');
    return { status: 'skipped', summary: reason };
  }

  await record({ botId: mod.id, action: 'bot.run.start', detail: { invokedBy: ctx.invokedBy } });
  try {
    const result = await mod.run(ctx);
    await record({
      botId: mod.id,
      action: 'bot.run.finish',
      detail: { status: result.status, summary: result.summary },
    });
    return result;
  } catch (err) {
    if (err instanceof InputUnavailable) {
      await record({
        botId: mod.id,
        action: 'bot.run.awaiting_input',
        detail: { needs: err.needs },
      });
      return { status: 'awaiting_input', summary: err.message };
    }
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message }, 'bot.run.error');
    await record({ botId: mod.id, action: 'bot.run.error', detail: { error: message } });
    throw err;
  }
}
