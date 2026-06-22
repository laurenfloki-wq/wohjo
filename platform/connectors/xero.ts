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

/** Create a bank transaction in Xero (idempotent via Reference). */
export async function createBankTransaction(
  txn: XeroBankTransaction,
): Promise<{ BankTransactions: Array<{ BankTransactionID: string }> }> {
  return xero('/BankTransactions', {
    method: 'POST',
    body: JSON.stringify({ BankTransactions: [txn] }),
  });
}
