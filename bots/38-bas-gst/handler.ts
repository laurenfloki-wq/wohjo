// Bot 38 — BAS/GST prep.
//
// Trigger: BAS-period | Runtime: pg_cron->EF | Gate: T2 lodge | Model: none.
//
// Assembles BAS-ready figures from period transactions. Deterministic; ties to
// Xero. Nothing is lodged without a director (T2). Figures use the standard BAS
// labels: G1 (total sales, GST-inclusive), 1A (GST on sales), 1B (GST on
// purchases), 7 (net GST).

import { gstFromInclusiveCents } from '../../platform/money';

export const BOT_ID = 'bot-38-bas-gst';

export interface PeriodTxn {
  /** GST-inclusive amount in cents. Positive = sale, negative = purchase. */
  grossCents: number;
  /** Whether GST applies (false for GST-free / input-taxed supplies). */
  taxable: boolean;
}

export interface BasFigures {
  G1_totalSalesCents: number;
  c1A_gstOnSalesCents: number;
  c1B_gstOnPurchasesCents: number;
  c7_netGstCents: number;
}

/** Pure assembly of BAS figures. */
export function assembleBas(txns: ReadonlyArray<PeriodTxn>): BasFigures {
  let g1 = 0;
  let gstSales = 0;
  let gstPurchases = 0;
  for (const t of txns) {
    if (t.grossCents >= 0) {
      g1 += t.grossCents;
      if (t.taxable) gstSales += gstFromInclusiveCents(t.grossCents);
    } else if (t.taxable) {
      gstPurchases += gstFromInclusiveCents(-t.grossCents);
    }
  }
  return {
    G1_totalSalesCents: g1,
    c1A_gstOnSalesCents: gstSales,
    c1B_gstOnPurchasesCents: gstPurchases,
    c7_netGstCents: gstSales - gstPurchases,
  };
}
