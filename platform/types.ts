// Shared types for the FLOSMOSIS bot fleet platform.
// Pure type declarations — no runtime, safe to import anywhere (Node or Deno).

/**
 * Gate tiers (GATE TIERS in the spec).
 *  - T0: autonomous, reversible, low stakes (logged).
 *  - T1: autonomous, notify-after.
 *  - T2: approve-before, single director.
 *  - T3: dual-control / minuted resolution.
 * Any message leaving the company to a customer, lead, or regulator is at minimum T2.
 */
export type GateTier = 'T0' | 'T1' | 'T2' | 'T3';

/**
 * Task class drives model routing in `llm.ts`.
 *  - classify/extract/route/tag/summary -> Haiku tier.
 *  - draft/reason/redline/answer       -> Sonnet tier.
 */
export type TaskClass =
  | 'classify'
  | 'extract'
  | 'route'
  | 'tag'
  | 'summary'
  | 'draft'
  | 'reason'
  | 'redline'
  | 'answer';

export type ModelTier = 'haiku' | 'sonnet';

/** Identifier for a bot, e.g. "bot-34-bookkeeping". */
export type BotId = string;

export interface BotConfigRow {
  bot_id: BotId;
  enabled: boolean;
  monthly_token_budget: number;
  tokens_used_this_month: number;
  notes: string | null;
}

export interface ApprovalRequest {
  id: string;
  bot_id: BotId;
  tier: GateTier;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  payload: Record<string, unknown>;
  proposed_action: string;
  /** pgmq message handle to resume on approval, when the flow is durable. */
  parked_queue: string | null;
  parked_msg_id: number | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface AuditRecordInput {
  botId: BotId;
  action: string;
  /** Free-form structured detail; redacted before logging, stored whole in the ledger. */
  detail: Record<string, unknown>;
  /** Optional idempotency key this record is associated with. */
  idempotencyKey?: string;
}
