// Bot 31 — Regulatory submission tracker.
//
// Trigger: cron + inbound email | Runtime: pg_cron->EF + EF (email) | Gate: T1
// internal, T3 filing | Model: Haiku (parse responses). Tracks SWA / state /
// ATO / FWO submissions, reminds on due dates, parses responses. The due/overdue
// detection is deterministic; nothing is filed without dual-control (T3).

export const BOT_ID = 'bot-31-regulatory-tracker';

export type SubmissionStatus = 'draft' | 'submitted' | 'accepted' | 'rejected';

export interface Submission {
  id: string;
  authority: 'SWA' | 'state' | 'ATO' | 'FWO';
  status: SubmissionStatus;
  dueInDays: number;
}

export interface SubmissionAlert {
  id: string;
  authority: Submission['authority'];
  kind: 'overdue' | 'due_soon';
  dueInDays: number;
}

/**
 * Pure: alert on submissions still open (draft/rejected) that are overdue or due
 * soon. Accepted/submitted items are not chased. Overdue first, then soonest.
 */
export function submissionAlerts(
  submissions: ReadonlyArray<Submission>,
  dueSoonDays = 14,
): SubmissionAlert[] {
  const open = submissions.filter((s) => s.status === 'draft' || s.status === 'rejected');
  const alerts: SubmissionAlert[] = [];
  for (const s of open) {
    if (s.dueInDays < 0) {
      alerts.push({ id: s.id, authority: s.authority, kind: 'overdue', dueInDays: s.dueInDays });
    } else if (s.dueInDays <= dueSoonDays) {
      alerts.push({ id: s.id, authority: s.authority, kind: 'due_soon', dueInDays: s.dueInDays });
    }
  }
  return alerts.sort((a, b) => a.dueInDays - b.dueInDays);
}
