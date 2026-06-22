// Database access for the bot fleet (Node / Vercel routes / evals).
//
// Uses postgres.js, matching the product's data layer. A single lazily
// constructed client is reused across invocations within a warm runtime.
// Edge Functions (Deno) use supabase-js or a Deno pg driver instead and do
// not import this module (see /functions import map).

import postgres from 'postgres';
import { requireEnv } from './env';

let _sql: postgres.Sql | null = null;

/**
 * Lazily construct the shared SQL client for the FLEET database. Never connects
 * at import time.
 *
 * IMPORTANT: the fleet uses its own `FLEET_DATABASE_URL` (the dedicated
 * flosmosis-fleet Supabase project), NOT the product's `DATABASE_URL`. The fleet
 * runs inside the product Next app and shares its process env; reusing
 * DATABASE_URL would point the fleet at the product DB (and/or break the
 * product). No fallback — fail loudly if the fleet DB is not configured.
 */
export function db(): postgres.Sql {
  if (_sql) return _sql;
  _sql = postgres(requireEnv('FLEET_DATABASE_URL'), {
    // Serverless-friendly: small pool, no long-lived prepared statements.
    max: 3,
    idle_timeout: 20,
    prepare: false,
  });
  return _sql;
}

/** For tests: inject a client (e.g. a pglite-backed postgres.js instance). */
export function __setDb(client: postgres.Sql): void {
  _sql = client;
}

/** Close the pool (used by long-running scripts / test teardown). */
export async function closeDb(): Promise<void> {
  if (_sql) {
    await _sql.end({ timeout: 5 });
    _sql = null;
  }
}
