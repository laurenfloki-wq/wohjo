// Bot 52 — Daily brief (FLOSMOSIS-calibrated).
//
// Trigger: morning | Runtime: pg_cron->EF | Gate: T1 | Model: Haiku (narrative).
// Assembles money / pipeline / CI / gates; Haiku narrates over figures that tie
// to source. Beyond the FYI sections it produces a prioritised "what needs you
// today" list — led by the things that cost money or block the business
// (runway, churn, revenue leakage, pending gates) so a founder reads one line
// and knows the day's priority. Deterministic.

import { FINANCE } from '../config';

export const BOT_ID = 'bot-52-daily-brief';

export interface BriefInputs {
  cashBalanceCents: number;
  mrrCents: number;
  newLeads: number;
  openDeals: number;
  ciRed: number;
  pendingApprovals: number;
  /** Optional risk signals (from churn/metering/finance bots) for prioritisation. */
  churnHighCount?: number;
  revenueLeakageCents?: number;
  runwayMonths?: number | null;
}

export interface BriefSection {
  heading: string;
  lines: string[];
}

const aud = (c: number) => `$${(c / 100).toFixed(2)}`;

/** Pure: assemble the FYI sections. */
export function assembleBrief(i: BriefInputs): BriefSection[] {
  return [
    { heading: 'Money', lines: [`Cash ${aud(i.cashBalanceCents)}`, `MRR ${aud(i.mrrCents)}`] },
    { heading: 'Pipeline', lines: [`${i.newLeads} new leads`, `${i.openDeals} open deals`] },
    { heading: 'Engineering', lines: [`${i.ciRed} red CI checks`] },
    { heading: 'Approvals', lines: [`${i.pendingApprovals} pending gates`] },
  ];
}

export interface PriorityAction {
  urgency: number; // higher first
  text: string;
}

/**
 * Pure: the prioritised "what needs you today" list. Ordered by business impact:
 * short runway and revenue leakage outrank pending gates, which outrank red CI,
 * which outranks churn watch. Empty = nothing needs the founder today.
 */
export function priorityActions(i: BriefInputs): PriorityAction[] {
  const actions: PriorityAction[] = [];
  if (i.runwayMonths != null && i.runwayMonths < FINANCE.runwayWarningMonths) {
    actions.push({
      urgency: 100,
      text: `Runway ${i.runwayMonths.toFixed(1)}mo — raise/cut decision.`,
    });
  }
  if (i.revenueLeakageCents && i.revenueLeakageCents > 0) {
    actions.push({
      urgency: 90,
      text: `Billing leakage ${aud(i.revenueLeakageCents)}/mo — fix metering.`,
    });
  }
  if (i.pendingApprovals > 0) {
    actions.push({ urgency: 80, text: `${i.pendingApprovals} approval(s) waiting on you.` });
  }
  if (i.ciRed > 0) {
    actions.push({ urgency: 60, text: `${i.ciRed} red CI check(s) blocking release.` });
  }
  if (i.churnHighCount && i.churnHighCount > 0) {
    actions.push({
      urgency: 50,
      text: `${i.churnHighCount} account(s) at high churn risk — save play.`,
    });
  }
  return actions.sort((a, b) => b.urgency - a.urgency);
}

/** Pure: does the brief warrant attention beyond an FYI? */
export function needsAttention(i: BriefInputs): boolean {
  return priorityActions(i).length > 0;
}
