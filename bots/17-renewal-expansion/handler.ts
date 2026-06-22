// Bot 17 — Renewal & expansion (FLOSMOSIS-calibrated).
//
// Trigger: daily | Runtime: pg_cron->EF | Gate: T2 outreach | Model: Haiku
// (summarise). Two revenue motions: (1) expansion — per-active-worker growth is
// the metered lever, so growth beyond a threshold is an upsell trigger; (2)
// at-risk renewal — a renewal that is imminent AND losing sealing activity is
// the save priority, not a routine renewal. Evidence is carried for grounded,
// non-speculative outreach. Thresholds in bots/config.ts.

import { RENEWAL } from '../config';

export const BOT_ID = 'bot-17-renewal-expansion';

export interface Subscription {
  tenantId: string;
  renewalInDays: number;
  activeWorkersAtSignup: number;
  activeWorkersNow: number;
  /** Days since last sealed clock-on — to detect a renewal at risk. */
  daysSinceLastSeal: number;
}

export type RenewalReason =
  | 'expansion'
  | 'renewal_due'
  | 'renewal_at_risk'
  | 'renewal_and_expansion';

export interface RenewalFlag {
  tenantId: string;
  reason: RenewalReason;
  renewalInDays: number;
  workerGrowth: number;
  workerGrowthPct: number;
  /** Suggested play for the (gated) outreach. */
  play: string;
}

/**
 * Pure: classify each subscription. Expansion when active-worker growth clears
 * the threshold; renewal_due within the window; renewal_at_risk when imminent
 * AND sealing has decayed (save play). Highest-value reason wins.
 */
export function detectRenewalsAndExpansion(subs: ReadonlyArray<Subscription>): RenewalFlag[] {
  const flags: RenewalFlag[] = [];
  for (const s of subs) {
    const growth = s.activeWorkersNow - s.activeWorkersAtSignup;
    const growthPct =
      s.activeWorkersAtSignup > 0 ? Math.round((growth / s.activeWorkersAtSignup) * 100) : 0;
    const expanding = growthPct >= RENEWAL.expansionGrowthPctThreshold;
    const renewalDue = s.renewalInDays >= 0 && s.renewalInDays <= RENEWAL.windowDays;
    const atRisk = renewalDue && s.daysSinceLastSeal >= RENEWAL.atRiskActivityDaysThreshold;

    if (!expanding && !renewalDue) continue;

    let reason: RenewalReason;
    let play: string;
    if (atRisk) {
      reason = 'renewal_at_risk';
      play = `Renewal in ${s.renewalInDays}d with sealing stalled (${s.daysSinceLastSeal}d) — save play, lead with value realised.`;
    } else if (renewalDue && expanding) {
      reason = 'renewal_and_expansion';
      play = `Renewal in ${s.renewalInDays}d and +${growthPct}% active workers — renew on the higher tier.`;
    } else if (expanding) {
      reason = 'expansion';
      play = `+${growthPct}% active workers — propose the next pricing tier (expansion revenue).`;
    } else {
      reason = 'renewal_due';
      play = `Routine renewal in ${s.renewalInDays}d — confirm and look for an expansion angle.`;
    }

    flags.push({
      tenantId: s.tenantId,
      reason,
      renewalInDays: s.renewalInDays,
      workerGrowth: growth,
      workerGrowthPct: growthPct,
      play,
    });
  }
  // At-risk first (save revenue before growing it), then soonest renewal.
  const priority: Record<RenewalReason, number> = {
    renewal_at_risk: 0,
    renewal_and_expansion: 1,
    expansion: 2,
    renewal_due: 3,
  };
  return flags.sort(
    (a, b) => priority[a.reason] - priority[b.reason] || a.renewalInDays - b.renewalInDays,
  );
}
