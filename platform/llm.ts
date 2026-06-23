// llm.ts — the single Claude client for the fleet.
//
// Responsibilities (MODEL TIERING & COST CONTROL):
//  - route model by task class (Haiku: classify/extract/route/tag/summary;
//    Sonnet: draft/reason/redline/answer);
//  - enable prompt caching on the stable system prompt + retrieved context;
//  - enforce the global kill switch and per-bot monthly token budget;
//  - log tokens + AUD cost to bot_runs;
//  - strict-JSON helper with zod schema validation.
//
// Calls the Anthropic REST API directly via fetch (no SDK dependency; Deno-safe).

import { z } from 'zod';
import { db } from './db';
import { requireEnv, envOr } from './env';
import { botLogger } from './log';
import type { BotId, ModelTier, TaskClass } from './types';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

const MODEL_BY_TIER: Record<ModelTier, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
};

// Pricing (USD per million tokens). Update as Anthropic pricing changes; FX
// from env so AUD figures stay current without code edits.
const PRICING_USD_PER_MTOK: Record<ModelTier, { input: number; output: number; cached: number }> = {
  haiku: { input: 1.0, output: 5.0, cached: 0.1 },
  sonnet: { input: 3.0, output: 15.0, cached: 0.3 },
};

export function tierForTask(task: TaskClass): ModelTier {
  switch (task) {
    case 'classify':
    case 'extract':
    case 'route':
    case 'tag':
    case 'summary':
      return 'haiku';
    case 'draft':
    case 'reason':
    case 'redline':
    case 'answer':
      return 'sonnet';
  }
}

export class BudgetExceededError extends Error {
  constructor(botId: string) {
    super(`Bot ${botId} has exceeded its monthly token budget; paused (raise T1 notice).`);
    this.name = 'BudgetExceededError';
  }
}

export class FleetHaltedError extends Error {
  constructor() {
    super('Global kill switch is engaged; fleet halted.');
    this.name = 'FleetHaltedError';
  }
}

/** Throws if the global kill switch is off or the bot is disabled / over budget. */
async function assertMayRun(botId: BotId): Promise<void> {
  const sql = db();
  const rows = await sql<
    {
      bot_id: string;
      enabled: boolean;
      monthly_token_budget: number;
      tokens_used_this_month: number;
    }[]
  >`
    select bot_id, enabled, monthly_token_budget, tokens_used_this_month
    from bot_config
    where bot_id in ('__global__', ${botId})
  `;
  const global = rows.find((r) => r.bot_id === '__global__');
  if (global && !global.enabled) throw new FleetHaltedError();

  const cfg = rows.find((r) => r.bot_id === botId);
  if (cfg) {
    if (!cfg.enabled) throw new BudgetExceededError(botId);
    if (cfg.monthly_token_budget > 0 && cfg.tokens_used_this_month >= cfg.monthly_token_budget) {
      throw new BudgetExceededError(botId);
    }
  }
}

export interface LlmCallOptions {
  botId: BotId;
  task: TaskClass;
  system: string;
  /** Retrieved context cached alongside the system prompt. */
  context?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  /** Force a tier (rare). Defaults to tierForTask(task). */
  tier?: ModelTier;
}

interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

/** Low-level call. Enforces kill switch + budget, logs cost, returns text. */
export async function complete(
  opts: LlmCallOptions,
): Promise<{ text: string; usage: AnthropicUsage }> {
  await assertMayRun(opts.botId);
  const tier = opts.tier ?? tierForTask(opts.task);
  const model = MODEL_BY_TIER[tier];
  const log = botLogger(opts.botId);

  // Stable system + retrieved context get cache_control for prompt caching.
  const system: Array<Record<string, unknown>> = [
    { type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } },
  ];
  if (opts.context) {
    system.push({ type: 'text', text: opts.context, cache_control: { type: 'ephemeral' } });
  }

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': requireEnv('ANTHROPIC_API_KEY'),
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 1024,
      system,
      messages: opts.messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    log.error({ status: res.status }, 'llm.call.failed');
    throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
    usage: AnthropicUsage;
  };
  const text = data.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');

  await logCost(opts.botId, opts.task, model, tier, data.usage);
  return { text, usage: data.usage };
}

/**
 * Pure cost calculation (AUD). Exported for golden evals so cost accounting is
 * deterministic and tested without a network call.
 */
export function priceAud(tier: ModelTier, usage: AnthropicUsage, fx: number): number {
  const p = PRICING_USD_PER_MTOK[tier];
  const cached = usage.cache_read_input_tokens ?? 0;
  const costUsd =
    (usage.input_tokens / 1e6) * p.input +
    (usage.output_tokens / 1e6) * p.output +
    (cached / 1e6) * p.cached;
  return costUsd * fx;
}

async function logCost(
  botId: BotId,
  task: TaskClass,
  model: string,
  tier: ModelTier,
  usage: AnthropicUsage,
): Promise<void> {
  const fx = Number(envOr('USD_TO_AUD', '1.52'));
  const cached = usage.cache_read_input_tokens ?? 0;
  const input = usage.input_tokens;
  const output = usage.output_tokens;
  const costAud = priceAud(tier, usage, fx);

  const sql = db();
  await sql`
    insert into bot_runs (bot_id, task_class, model, input_tokens, output_tokens, cached_tokens, cost_aud)
    values (${botId}, ${task}, ${model}, ${input}, ${output}, ${cached}, ${costAud})
  `;
  await sql`
    update bot_config
    set tokens_used_this_month = tokens_used_this_month + ${input + output},
        updated_at = now()
    where bot_id = ${botId}
  `;
}

/**
 * Strict-JSON helper. Instructs the model to return only JSON, parses it, and
 * validates against a zod schema. Throws on parse/validation failure.
 */
export async function completeJson<T>(
  opts: LlmCallOptions,
  schema: z.ZodType<T>,
): Promise<{ value: T; usage: AnthropicUsage }> {
  const guarded: LlmCallOptions = {
    ...opts,
    system:
      opts.system +
      '\n\nRespond with a single valid JSON object only. No prose, no code fences, no emoji.',
  };
  const { text, usage } = await complete(guarded);
  const cleaned = stripCodeFence(text).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`completeJson: model did not return valid JSON: ${cleaned.slice(0, 300)}`);
  }
  return { value: schema.parse(parsed), usage };
}

function stripCodeFence(s: string): string {
  const m = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m ? (m[1] ?? s) : s;
}
