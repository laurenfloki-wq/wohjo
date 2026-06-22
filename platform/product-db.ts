// product-db.ts — READ-ONLY access to the product's database.
//
// Some bots derive signals from the product's own data (e.g. active-worker
// counts per company). Those reads use the product's `DATABASE_URL` — a
// SEPARATE connection from the fleet's `FLEET_DATABASE_URL` (platform/db.ts).
// The fleet never writes here; it only reads forensic/operational facts to feed
// a bot's pure core. Service-role connection bypasses RLS.

import postgres from 'postgres';
import { requireEnv } from './env';

let _sql: postgres.Sql | null = null;

function productDb(): postgres.Sql {
  if (_sql) return _sql;
  _sql = postgres(requireEnv('DATABASE_URL'), { max: 2, idle_timeout: 20, prepare: false });
  return _sql;
}

/** True when the product DB is configured (so a bot can self-feed from it). */
export function hasProductDb(): boolean {
  // Presence check without connecting.
  return Boolean(
    (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
      ?.DATABASE_URL,
  );
}

/**
 * Active workers per company (the metered unit). `is_active = true` grouped by
 * company_id. Returns tenantId (company id) + count.
 */
export async function activeWorkersByCompany(): Promise<
  Array<{ tenantId: string; activeWorkers: number }>
> {
  const sql = productDb();
  const rows = await sql<{ company_id: string; n: string }[]>`
    select company_id, count(*)::text as n
    from workers
    where is_active = true and company_id is not null
    group by company_id
  `;
  return rows.map((r) => ({ tenantId: r.company_id, activeWorkers: Number(r.n) }));
}
