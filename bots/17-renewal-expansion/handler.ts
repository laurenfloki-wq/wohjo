// Bot 17 — Renewal & expansion.
//
// Trigger: daily | Runtime: pg_cron->EF | Gate: T2 outreach | Model: Haiku
// (summarise only). Detects upcoming renewals and per-active-worker growth and
// flags them with evidence. The detection is pure and deterministic; the Haiku
// summary phrases the evidence and is gated T2 before any outreach.

export const BOT_ID = 'bot-17-renewal-expansion';

export interface Subscription {
  tenantId: string;
  renewalInDays: number;
  activeWorkersAtSignup: number;
  activeWorkersNow: number;
}

export interface RenewalFlag {
  tenantId: string;
  reason: 'renewal_due' | 'expansion' | 'renewal_and_expansion';
  renewalInDays: number;
  workerGrowth: number; // absolute increase
  workerGrowthPct: number; // percentage increase, rounded
}

/**
 * Pure: flag tenants renewing within `renewalWindowDays` and/or showing
 * active-worker growth beyond `growthThresholdPct`. Evidence (days, growth) is
 * carried so outreach can be grounded, not speculative.
 */
export function detectRenewalsAndExpansion(
  subs: ReadonlyArray<Subscription>,
  opts: { renewalWindowDays?: number; growthThresholdPct?: number } = {},
): RenewalFlag[] {
  const window = opts.renewalWindowDays ?? 30;
  const threshold = opts.growthThresholdPct ?? 20;
  const flags: RenewalFlag[] = [];

  for (const s of subs) {
    const growth = s.activeWorkersNow - s.activeWorkersAtSignup;
    const growthPct =
      s.activeWorkersAtSignup > 0 ? Math.round((growth / s.activeWorkersAtSignup) * 100) : 0;
    const renewalDue = s.renewalInDays >= 0 && s.renewalInDays <= window;
    const expanding = growthPct >= threshold;
    if (!renewalDue && !expanding) continue;

    const reason: RenewalFlag['reason'] =
      renewalDue && expanding ? 'renewal_and_expansion' : renewalDue ? 'renewal_due' : 'expansion';
    flags.push({
      tenantId: s.tenantId,
      reason,
      renewalInDays: s.renewalInDays,
      workerGrowth: growth,
      workerGrowthPct: growthPct,
    });
  }
  return flags;
}
