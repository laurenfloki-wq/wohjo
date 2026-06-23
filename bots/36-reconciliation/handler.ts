// Bot 36 — Reconciliation.
//
// Trigger: daily | Runtime: pg_cron->EF | Gate: T2 on break | Model: none.
//
// Three-way match across Stripe (money in), Xero (booked), and Supabase (the
// product's own record of the charge). Any break is raised for a director;
// nothing is silently "fixed". Deterministic.

export const BOT_ID = 'bot-36-reconciliation';

export interface ThreeWayRow {
  reference: string;
  stripeCents: number | null;
  xeroCents: number | null;
  ledgerCents: number | null;
}

export type BreakKind =
  | 'missing_in_xero'
  | 'missing_in_stripe'
  | 'missing_in_ledger'
  | 'amount_mismatch';

export interface ReconBreak {
  reference: string;
  kind: BreakKind;
  stripeCents: number | null;
  xeroCents: number | null;
  ledgerCents: number | null;
}

/**
 * Pure: return one break per reference that does not reconcile across all three
 * sources. An empty result means every reference matches to the cent.
 */
export function threeWayMatch(rows: ReadonlyArray<ThreeWayRow>): ReconBreak[] {
  const breaks: ReconBreak[] = [];
  for (const r of rows) {
    const base = {
      reference: r.reference,
      stripeCents: r.stripeCents,
      xeroCents: r.xeroCents,
      ledgerCents: r.ledgerCents,
    };
    if (r.stripeCents === null) {
      breaks.push({ ...base, kind: 'missing_in_stripe' });
      continue;
    }
    if (r.xeroCents === null) {
      breaks.push({ ...base, kind: 'missing_in_xero' });
      continue;
    }
    if (r.ledgerCents === null) {
      breaks.push({ ...base, kind: 'missing_in_ledger' });
      continue;
    }
    if (!(r.stripeCents === r.xeroCents && r.xeroCents === r.ledgerCents)) {
      breaks.push({ ...base, kind: 'amount_mismatch' });
    }
  }
  return breaks;
}
