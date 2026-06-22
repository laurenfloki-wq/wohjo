// Bot 40 — Financial reporting.
//
// Trigger: monthly | Runtime: pg_cron->EF | Gate: T1 | Model: Haiku (narrative).
//
// Computes P&L, cash, and runway deterministically (figures must tie to source);
// the LLM only writes the narrative over those numbers, never invents them.

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
  netProfitCents: number;
  cashBalanceCents: number;
  monthlyBurnCents: number;
  /** Months of runway; null when cash-flow positive (no burn). */
  runwayMonths: number | null;
}

/**
 * Pure: derive the headline figures. Runway = cash / burn, where burn is net
 * loss per month. If the business is profitable (no burn), runway is null
 * (effectively infinite) rather than a misleading number.
 */
export function buildReport(f: MonthFigures): FinancialReport {
  const grossProfit = f.revenueCents - f.cogsCents;
  const netProfit = grossProfit - f.opexCents;
  const burn = netProfit < 0 ? -netProfit : 0;
  const runwayMonths = burn > 0 ? f.cashBalanceCents / burn : null;
  return {
    revenueCents: f.revenueCents,
    grossProfitCents: grossProfit,
    netProfitCents: netProfit,
    cashBalanceCents: f.cashBalanceCents,
    monthlyBurnCents: burn,
    runwayMonths,
  };
}
