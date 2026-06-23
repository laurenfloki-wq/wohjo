// Bot 40 — Financial reporting (FLOSMOSIS-calibrated).
//
// Trigger: monthly | Runtime: pg_cron->EF | Gate: T1 | Model: Haiku (narrative).
//
// Board-grade figures, computed deterministically and tied to source; the Haiku
// narrative only describes them. Adds the metrics a SaaS board acts on: gross
// margin %, net margin %, runway, and an explicit runway/margin alert so a
// raise-or-cut decision is never buried in prose. Thresholds in bots/config.ts.

import { FINANCE } from '../config';

export const BOT_ID = 'bot-40-financial-reporting';

export interface MonthFigures {
  revenueCents: number;
  cogsCents: number;
  opexCents: number;
  cashBalanceCents: number;
}

export interface FinancialReport {
  revenueCents: number;
  grossProfitCents: number;
  grossMarginPct: number | null;
  netProfitCents: number;
  netMarginPct: number | null;
  cashBalanceCents: number;
  monthlyBurnCents: number;
  /** Months of runway; null when cash-flow positive (no burn). */
  runwayMonths: number | null;
  /** Board alerts that should not be buried in narrative. */
  alerts: string[];
}

function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

/** Pure: derive board-grade figures + alerts. */
export function buildReport(f: MonthFigures): FinancialReport {
  const grossProfit = f.revenueCents - f.cogsCents;
  const netProfit = grossProfit - f.opexCents;
  const burn = netProfit < 0 ? -netProfit : 0;
  const runwayMonths = burn > 0 ? f.cashBalanceCents / burn : null;
  const grossMarginPct = pct(grossProfit, f.revenueCents);
  const netMarginPct = pct(netProfit, f.revenueCents);

  const alerts: string[] = [];
  if (runwayMonths !== null && runwayMonths < FINANCE.runwayWarningMonths) {
    alerts.push(
      `Runway ${runwayMonths.toFixed(1)} months (< ${FINANCE.runwayWarningMonths}) — raise or cut decision window.`,
    );
  }
  if (grossMarginPct !== null && grossMarginPct < FINANCE.grossMarginWarningPct) {
    alerts.push(
      `Gross margin ${grossMarginPct}% (< ${FINANCE.grossMarginWarningPct}%) — COGS review.`,
    );
  }

  return {
    revenueCents: f.revenueCents,
    grossProfitCents: grossProfit,
    grossMarginPct,
    netProfitCents: netProfit,
    netMarginPct,
    cashBalanceCents: f.cashBalanceCents,
    monthlyBurnCents: burn,
    runwayMonths,
    alerts,
  };
}
