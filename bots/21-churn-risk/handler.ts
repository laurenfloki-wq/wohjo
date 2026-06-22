// Bot 21 — Churn-risk (FLOSMOSIS-calibrated).
//
// Trigger: daily | Runtime: pg_cron->EF | Gate: T1 | Model: Haiku (summarise).
//
// The leading indicator for this product is "days since last SEALED clock-on" —
// the value event. A tenant that has stopped sealing is disengaging before any
// billing signal appears. Secondary: metered-unit (active-worker) decline,
// onboarding never completed (no first seal), failed payments, support friction.
// Explainable; thresholds in bots/config.ts.

import { CHURN } from '../config';

export const BOT_ID = 'bot-21-churn-risk';

export interface UsageSignals {
  tenantId: string;
  /** Days since the last sealed clock-on — the product's pulse. */
  daysSinceLastSeal: number;
  /** Active-worker (metered unit) trend; negative = shrinking. */
  activeWorkerTrendPct: number;
  /** Reached first sealed clock-on during onboarding. */
  onboardingComplete: boolean;
  failedPayments: number;
  supportTicketsOpen: number;
}

export interface ChurnRisk {
  tenantId: string;
  score: number; // 0-100, higher = more at risk
  band: 'low' | 'medium' | 'high';
  /** The single biggest driver, for the outreach play. */
  primaryDriver: string;
  reasons: string[];
}

export function scoreChurn(s: UsageSignals): ChurnRisk {
  const reasons: string[] = [];
  const drivers: Array<{ points: number; reason: string }> = [];
  const add = (points: number, reason: string) => {
    if (points > 0) {
      drivers.push({ points, reason });
      reasons.push(reason);
    }
  };

  // Sealed clock-on recency — leads.
  if (s.daysSinceLastSeal >= CHURN.sealedClockOn.criticalDays) {
    add(CHURN.sealedClockOn.criticalPoints, `no sealed clock-on in ${s.daysSinceLastSeal} days`);
  } else if (s.daysSinceLastSeal >= CHURN.sealedClockOn.warningDays) {
    add(
      CHURN.sealedClockOn.warningPoints,
      `sealing slowed (${s.daysSinceLastSeal} days since last seal)`,
    );
  }

  if (s.activeWorkerTrendPct <= -CHURN.activeWorkerDeclinePctThreshold) {
    add(
      CHURN.activeWorkerDeclinePoints,
      `active workers down ${Math.abs(s.activeWorkerTrendPct)}%`,
    );
  }
  if (!s.onboardingComplete) {
    add(CHURN.onboardingIncompletePoints, 'never reached first sealed clock-on');
  }
  if (s.failedPayments > 0) {
    add(CHURN.failedPaymentPoints, `${s.failedPayments} failed payment(s)`);
  }
  if (s.supportTicketsOpen >= CHURN.supportFrictionTickets) {
    add(CHURN.supportFrictionPoints, `${s.supportTicketsOpen} open support tickets`);
  }

  const score = Math.min(
    100,
    drivers.reduce((sum, d) => sum + d.points, 0),
  );
  const band: ChurnRisk['band'] =
    score >= CHURN.bands.high ? 'high' : score >= CHURN.bands.medium ? 'medium' : 'low';
  const primaryDriver = drivers.sort((a, b) => b.points - a.points)[0]?.reason ?? 'healthy';
  return { tenantId: s.tenantId, score, band, primaryDriver, reasons };
}

/** Pure: rank tenants by churn risk, highest first. */
export function rankChurn(signals: ReadonlyArray<UsageSignals>): ChurnRisk[] {
  return signals.map(scoreChurn).sort((a, b) => b.score - a.score);
}
