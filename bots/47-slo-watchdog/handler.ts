// Bot 47 — Uptime/SLO watchdog.
//
// Trigger: continuous + checks | Runtime: external uptime monitor +
// pg_cron->EF | Gate: T1 | Model: none. Watches the error budget; pages on
// burn; triggers rollback. The burn-rate maths is pure and deterministic.

export const BOT_ID = 'bot-47-slo-watchdog';

export interface SloWindow {
  /** Target availability, e.g. 0.999 for three nines. */
  slo: number;
  totalRequests: number;
  failedRequests: number;
}

export interface BurnAssessment {
  errorRate: number;
  /** Allowed error budget for the window (1 - slo). */
  budget: number;
  /** errorRate / budget. >1 means the budget is being burned faster than allowed. */
  burnRate: number;
  page: boolean;
  rollback: boolean;
}

/**
 * Pure: assess error-budget burn. Page when burn exceeds `pageAt` (default 2x);
 * recommend rollback when it exceeds `rollbackAt` (default 10x) — a fast-burn
 * signal that the current deploy is actively breaching the SLO.
 */
export function assessBurn(
  w: SloWindow,
  opts: { pageAt?: number; rollbackAt?: number } = {},
): BurnAssessment {
  const pageAt = opts.pageAt ?? 2;
  const rollbackAt = opts.rollbackAt ?? 10;
  const errorRate = w.totalRequests > 0 ? w.failedRequests / w.totalRequests : 0;
  const budget = 1 - w.slo;
  const burnRate = budget > 0 ? errorRate / budget : errorRate > 0 ? Infinity : 0;
  return {
    errorRate,
    budget,
    burnRate,
    page: burnRate >= pageAt,
    rollback: burnRate >= rollbackAt,
  };
}
