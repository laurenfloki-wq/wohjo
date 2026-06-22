// Bot 52 — Daily brief.
//
// Trigger: morning | Runtime: pg_cron->EF | Gate: T1 | Model: Haiku (narrative).
// Assembles money / pipeline / CI / pending-gates into one brief; Haiku writes
// the narrative over figures that tie to source. Assembly is deterministic.

export const BOT_ID = 'bot-52-daily-brief';

export interface BriefInputs {
  cashBalanceCents: number;
  mrrCents: number;
  newLeads: number;
  openDeals: number;
  ciRed: number;
  pendingApprovals: number;
}

export interface BriefSection {
  heading: string;
  lines: string[];
}

/** Pure: assemble the brief sections from source figures. */
export function assembleBrief(i: BriefInputs): BriefSection[] {
  const aud = (c: number) => `$${(c / 100).toFixed(2)}`;
  const sections: BriefSection[] = [
    { heading: 'Money', lines: [`Cash ${aud(i.cashBalanceCents)}`, `MRR ${aud(i.mrrCents)}`] },
    { heading: 'Pipeline', lines: [`${i.newLeads} new leads`, `${i.openDeals} open deals`] },
    { heading: 'Engineering', lines: [`${i.ciRed} red CI checks`] },
    { heading: 'Approvals', lines: [`${i.pendingApprovals} pending gates`] },
  ];
  return sections;
}

/** Pure: does the brief warrant attention beyond an FYI? (red CI or pending gates) */
export function needsAttention(i: BriefInputs): boolean {
  return i.ciRed > 0 || i.pendingApprovals > 0;
}
