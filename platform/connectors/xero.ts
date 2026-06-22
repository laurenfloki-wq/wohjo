// Xero connector — typed fetch wrapper. OAuth2 with token lifecycle.
//
// Used by bots 34 (bookkeeping), 38 (BAS/GST), 40 (financial reporting).
// Tokens are refreshed via a shared helper that reads/writes an encrypted,
// vault-backed table in Supabase (see CONNECTORS in the spec). Here we accept a
// fresh access token from that helper rather than embedding refresh logic, so
// the connector stays a thin, testable surface.

import { requireEnv } from '../env';

const XERO_API = 'https://api.xero.com/api.xro/2.0';

/** Obtain a fresh Xero access token. Placeholder until the vault helper lands. */
export async function getAccessToken(): Promise<string> {
  // Real implementation: read refresh token from the vault-backed table, call
  // https://identity.xero.com/connect/token, persist the rotated refresh token.
  return requireEnv('XERO_ACCESS_TOKEN');
}

async function xero<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${XERO_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'xero-tenant-id': requireEnv('XERO_TENANT_ID'),
      accept: 'application/json',
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Xero ${path} -> ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export interface XeroBankTransaction {
  Type: 'RECEIVE' | 'SPEND';
  Contact: { Name: string };
  LineItems: Array<{
    Description: string;
    UnitAmount: number;
    AccountCode: string;
    TaxType: string;
  }>;
  /** Idempotency: Xero dedupes on this when set. */
  Reference: string;
}

// --- Reads (financial reporting / BAS) -------------------------------------

/** Minimal shape of a Xero ProfitAndLoss report we parse. */
export interface XeroReport {
  Reports: Array<{
    Rows: Array<{
      RowType: string;
      Title?: string;
      Rows?: Array<{ RowType: string; Cells: Array<{ Value: string }> }>;
    }>;
  }>;
}

/** Fetch the ProfitAndLoss report for a period. */
export async function getProfitAndLoss(fromDate: string, toDate: string): Promise<XeroReport> {
  return xero(`/Reports/ProfitAndLoss?fromDate=${fromDate}&toDate=${toDate}`);
}

function parseCents(value: string | undefined): number {
  if (!value) return 0;
  const n = Number(value.replace(/[^0-9.-]/g, ''));
  return Number.isNaN(n) ? 0 : Math.round(n * 100);
}

/**
 * Pure: extract revenue / COGS / opex (cents) from a Xero ProfitAndLoss report
 * by matching the canonical summary row titles. Cash is not in P&L; callers
 * supply it from the bank summary. Deterministic and tested.
 */
export function parseProfitAndLoss(report: XeroReport): {
  revenueCents: number;
  cogsCents: number;
  opexCents: number;
} {
  let revenueCents = 0;
  let cogsCents = 0;
  let opexCents = 0;
  for (const section of report.Reports[0]?.Rows ?? []) {
    for (const row of section.Rows ?? []) {
      const label = (row.Cells[0]?.Value ?? '').toLowerCase();
      const amount = parseCents(row.Cells[1]?.Value);
      if (label.startsWith('total income') || label.startsWith('total revenue'))
        revenueCents = amount;
      else if (label.startsWith('total cost of sales') || label.startsWith('total cogs'))
        cogsCents = amount;
      else if (label.startsWith('total operating expenses') || label.startsWith('total expenses')) {
        opexCents = amount;
      }
    }
  }
  return { revenueCents, cogsCents, opexCents };
}

/** Create a bank transaction in Xero (idempotent via Reference). */
export async function createBankTransaction(
  txn: XeroBankTransaction,
): Promise<{ BankTransactions: Array<{ BankTransactionID: string }> }> {
  return xero('/BankTransactions', {
    method: 'POST',
    body: JSON.stringify({ BankTransactions: [txn] }),
  });
}
