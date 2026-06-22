// hitl.ts — human-in-the-loop approval gates (the runtime behind bot 57).
//
// requestApproval writes a bot_approval_requests row, notifies email + SMS,
// and (for durable flows) records the parked pgmq message so resolution can
// resume the exact paused flow. resolveApproval records the decision in the
// ledger; on rejection the caller runs the compensating action.
//
// No external customer-facing message is ever auto-sent (HARD CONSTRAINT 3):
// gated paths stop here until a director resolves them.

import { db } from './db';
import { record } from './audit';
import { envOr, env } from './env';
import { botLogger } from './log';
import type { ApprovalRequest, BotId, GateTier } from './types';

export interface RequestApprovalInput {
  botId: BotId;
  tier: GateTier;
  payload: Record<string, unknown>;
  proposedAction: string;
  /** For durable flows: the queue + message id to resume on approval. */
  parked?: { queue: string; msgId: number };
  /** Hours until the request auto-expires (swept by pg_cron). */
  expiresInHours?: number;
}

/** Create an approval request, notify the directors, and return its id. */
export async function requestApproval(input: RequestApprovalInput): Promise<{ id: string }> {
  const sql = db();
  const expiresAt =
    input.expiresInHours !== undefined
      ? new Date(Date.now() + input.expiresInHours * 3600_000).toISOString()
      : null;

  const rows = await sql<{ id: string }[]>`
    insert into bot_approval_requests
      (bot_id, tier, payload, proposed_action, parked_queue, parked_msg_id, expires_at)
    values (
      ${input.botId},
      ${input.tier},
      ${sql.json(input.payload as Parameters<typeof sql.json>[0])},
      ${input.proposedAction},
      ${input.parked?.queue ?? null},
      ${input.parked?.msgId ?? null},
      ${expiresAt}
    )
    returning id
  `;
  const row = rows[0];
  if (!row) throw new Error('requestApproval: insert returned no row');

  await record({
    botId: input.botId,
    action: 'approval.requested',
    detail: { approvalId: row.id, tier: input.tier, proposedAction: input.proposedAction },
  });

  await notify(input, row.id);
  return { id: row.id };
}

/** Fetch pending approvals (used by the approval UI and the notifier). */
export async function listPending(): Promise<ApprovalRequest[]> {
  const sql = db();
  return sql<ApprovalRequest[]>`
    select id, bot_id, tier, status, payload, proposed_action,
           parked_queue, parked_msg_id, created_at, resolved_at, resolved_by
    from bot_approval_requests
    where status = 'pending'
    order by created_at asc
  `;
}

export interface ResolutionResult {
  approval: ApprovalRequest;
  /** Present when a durable flow should resume. */
  resume: { queue: string; msgId: number } | null;
}

/**
 * Resolve an approval. Records the decision in the ledger and returns the
 * parked message (if any) so the caller / approval router can resume or
 * compensate. Idempotent: resolving an already-resolved request is a no-op
 * that returns the existing state.
 */
export async function resolveApproval(
  approvalId: string,
  decision: 'approved' | 'rejected',
  resolvedBy: string,
): Promise<ResolutionResult> {
  const sql = db();
  const rows = await sql<ApprovalRequest[]>`
    update bot_approval_requests
    set status = ${decision}, resolved_at = now(), resolved_by = ${resolvedBy}
    where id = ${approvalId} and status = 'pending'
    returning id, bot_id, tier, status, payload, proposed_action,
              parked_queue, parked_msg_id, created_at, resolved_at, resolved_by
  `;

  let approval = rows[0];
  if (!approval) {
    // Already resolved (or missing): fetch current state, do not double-record.
    const existing = await sql<ApprovalRequest[]>`
      select id, bot_id, tier, status, payload, proposed_action,
             parked_queue, parked_msg_id, created_at, resolved_at, resolved_by
      from bot_approval_requests where id = ${approvalId}
    `;
    const found = existing[0];
    if (!found) throw new Error(`resolveApproval: no such approval ${approvalId}`);
    approval = found;
    return { approval, resume: null };
  }

  await record({
    botId: approval.bot_id,
    action: decision === 'approved' ? 'approval.approved' : 'approval.rejected',
    detail: { approvalId, resolvedBy, proposedAction: approval.proposed_action },
  });

  const resume =
    decision === 'approved' && approval.parked_queue && approval.parked_msg_id !== null
      ? { queue: approval.parked_queue, msgId: approval.parked_msg_id }
      : null;
  return { approval, resume };
}

/** Sweep expired pending approvals (called by pg_cron). Returns count expired. */
export async function sweepExpired(): Promise<number> {
  const sql = db();
  const rows = await sql<{ id: string }[]>`
    update bot_approval_requests
    set status = 'expired', resolved_at = now(), resolved_by = 'system:expiry'
    where status = 'pending' and expires_at is not null and expires_at < now()
    returning id
  `;
  return rows.length;
}

/**
 * Notify directors by email + SMS. Best-effort: a notification failure must
 * not lose the approval (it is durably stored). Actual provider sends are
 * wired to connectors and stay behind their own scoped credentials; here we
 * log the intent and surface the approval URL. Real provider calls are added
 * when secrets are present (see SECRETS.md).
 */
async function notify(input: RequestApprovalInput, approvalId: string): Promise<void> {
  const log = botLogger('bot-57-approval-router');
  const base = envOr('APPROVAL_UI_BASE_URL', 'https://approvals.flosmosis.invalid');
  const url = `${base}/approvals/${approvalId}`;
  const channels: string[] = [];
  if (env('APPROVAL_NOTIFY_EMAIL') && env('RESEND_API_KEY')) channels.push('email');
  if (env('APPROVAL_NOTIFY_SMS') && env('TWILIO_AUTH_TOKEN')) channels.push('sms');
  log.info(
    { approvalId, tier: input.tier, url, channels },
    channels.length ? 'approval.notify' : 'approval.notify.skipped_no_secrets',
  );
  // Provider sends (Resend / Twilio) are invoked here once secrets are present.
}
