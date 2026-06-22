// Bot 21 — Churn-risk.
//
// Trigger: daily | Runtime: pg_cron->EF | Gate: T1 | Model: Haiku (summarise
// risk). The health score is deterministic and explainable; Haiku only writes
// the risk narrative over the ranked list.

export const BOT_ID = 'bot-21-churn-risk';

export interface UsageSignals {
  tenantId: string;
  daysSinceLastSeal: number; // core product activity
  activeWorkerTrendPct: number; // negative = shrinking
  supportTicketsOpen: number;
  failedPayments: number;
}

export interface ChurnRisk {
  tenantId: string;
  score: number; // 0-100, higher = more at risk
  band: 'low' | 'medium' | 'high';
  reasons: string[];
}

/** Pure, explainable churn-risk score. */
export function scoreChurn(s: UsageSignals): ChurnRisk {
  const reasons: string[] = [];
  let score = 0;
  if (s.daysSinceLastSeal >= 14) {
    score += 40;
    reasons.push(`no sealed activity in ${s.daysSinceLastSeal} days`);
  } else if (s.daysSinceLastSeal >= 7) {
    score += 20;
    reasons.push(`reduced activity (${s.daysSinceLastSeal} days since last seal)`);
  }
  if (s.activeWorkerTrendPct <= -20) {
    score += 25;
    reasons.push(`active workers down ${Math.abs(s.activeWorkerTrendPct)}%`);
  }
  if (s.failedPayments > 0) {
    score += 20;
    reasons.push(`${s.failedPayments} failed payment(s)`);
  }
  if (s.supportTicketsOpen >= 3) {
    score += 15;
    reasons.push(`${s.supportTicketsOpen} open support tickets`);
  }
  score = Math.min(100, score);
  const band: ChurnRisk['band'] = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
  return { tenantId: s.tenantId, score, band, reasons };
}

/** Pure: rank tenants by churn risk, highest first. */
export function rankChurn(signals: ReadonlyArray<UsageSignals>): ChurnRisk[] {
  return signals.map(scoreChurn).sort((a, b) => b.score - a.score);
}
