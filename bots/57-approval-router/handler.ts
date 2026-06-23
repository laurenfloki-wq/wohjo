// Bot 57 — Approval router (the spine).
//
// Trigger: gate events + UI + expiry | Runtime: EF (API) + Vercel (UI) +
// pg_cron (expiry sweep) | Model: none | Gate: infra.
//
// One queue for every gate. Resolving an approval resumes the exact paused
// pgmq message (on approve) or runs the compensating action (on reject). Every
// resolution hits the ledger (handled inside platform/hitl).

import { resolveApproval, listPending, sweepExpired } from '../../platform/hitl';
import { enqueue } from '../../platform/queue';
import { record } from '../../platform/audit';
import type { ResolutionResult } from '../../platform/hitl';

export const BOT_ID = 'bot-57-approval-router';

/**
 * Pure decision: given a resolution, what should the router do next?
 * Exported so the resume/compensate branching is deterministically testable
 * without a database.
 */
export type RouterNextAction =
  | { kind: 'resume'; queue: string; msgId: number }
  | { kind: 'compensate'; compensationTopic: string | null }
  | { kind: 'noop' };

export function decideNext(
  result: ResolutionResult,
  compensationTopic: string | null,
): RouterNextAction {
  if (result.approval.status === 'approved' && result.resume) {
    return { kind: 'resume', queue: result.resume.queue, msgId: result.resume.msgId };
  }
  if (result.approval.status === 'rejected') {
    return { kind: 'compensate', compensationTopic };
  }
  return { kind: 'noop' };
}

export { listPending };

/**
 * Resolve an approval and act: on approve, re-trigger the parked queue drain
 * (the worker picks the message up again from where it parked); on reject,
 * enqueue the compensating action so the saga unwinds.
 */
export async function resolve(
  approvalId: string,
  decision: 'approved' | 'rejected',
  resolvedBy: string,
  opts: { compensationTopic?: string; compensationPayload?: Record<string, unknown> } = {},
): Promise<RouterNextAction> {
  const result = await resolveApproval(approvalId, decision, resolvedBy);
  const next = decideNext(result, opts.compensationTopic ?? null);

  if (next.kind === 'resume') {
    await record({
      botId: BOT_ID,
      action: 'approval.resume',
      detail: { approvalId, queue: next.queue, msgId: next.msgId },
    });
    // The parked message becomes visible again on its queue; the per-minute
    // worker drain processes it. Nothing to re-enqueue: it was never removed.
  } else if (next.kind === 'compensate' && next.compensationTopic) {
    await enqueue(next.compensationTopic, {
      reason: 'approval_rejected',
      approvalId,
      ...(opts.compensationPayload ?? {}),
    });
    await record({
      botId: BOT_ID,
      action: 'approval.compensate',
      detail: { approvalId, compensationTopic: next.compensationTopic },
    });
  }
  return next;
}

/** Expiry sweep, invoked by pg_cron. */
export async function runExpirySweep(): Promise<{ expired: number }> {
  const expired = await sweepExpired();
  if (expired > 0) {
    await record({ botId: BOT_ID, action: 'approval.expiry_sweep', detail: { expired } });
  }
  return { expired };
}
