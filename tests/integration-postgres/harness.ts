// FLOSTRUCTION integration-postgres harness.
//
// Spins up an isolated in-process PGlite (real PostgreSQL compiled
// to WASM via @electric-sql/pglite). Loads bootstrap.sql (schema +
// constraints + chain-integrity trigger + count_broken_chain_links)
// then seed.sql (tenant scaffolding + the two forensic anomaly rows
// + the WLES v1 bridge).
//
// This is the assurance layer. Constraints, triggers, and RLS run
// for real here — no mocks. If a test passes here, the live DB will
// honour the same semantics; if a test fails here, the live DB will
// reject the operation too.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface HarnessHandle {
  db: PGlite;
  /** Run as a specific app user (sets `app.current_user_id` for auth.uid()). */
  withUser<T>(userId: string | null, fn: () => Promise<T>): Promise<T>;
  /** Run any SQL on the harness DB. */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Closes the in-process db. */
  close(): Promise<void>;
}

export const TENANT_ID = '00000000-1000-0000-0000-000000000001';
export const WORKER_ID = '00000000-2000-0000-0000-000000000001';
export const SITE_ID = '00000000-3000-0000-0000-000000000001';
export const DIRECTOR_USER = 'fb9110c8-bea7-4fc4-8a1e-7c3bc45c71c7';
export const PAYROLL_USER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
export const VIEWER_USER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
export const SUPERVISOR_USER = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

/** The two forensic anomaly row identifiers — preserved unmutated. */
export const ANOMALY_PAYROLL_ID = 'd6249c3a-9fe9-458c-87c0-b396f8af09c2';
export const ANOMALY_EXPORT_ID = 'e22ee9fd-5c89-45fe-a264-ba928ab6b01f';
export const ANOMALY_PAYROLL_HASH =
  'd86404dc70fa0a039835c438bf75f9c463fd71e76d0f56d175511e2f8e9cb3c1';
export const ANOMALY_EXPORT_HASH =
  '92fbeca77eab1576436ee0eaf57ebaed2102fdd5f3f52275a34f1bae4e62e0d2';

/** v1 bridge event hash — the v1 chain anchor for the seeded company. */
export const BRIDGE_EVENT_HASH = 'ec801f172bbf53da26bc6d6b153e0d30b32d146051063e56469ad9c47a764fbd';

export async function setupHarness(): Promise<HarnessHandle> {
  const db = new PGlite();
  const bootstrap = readFileSync(join(__dirname, 'bootstrap.sql'), 'utf-8');
  const seed = readFileSync(join(__dirname, 'seed.sql'), 'utf-8');
  // pglite accepts multi-statement scripts via exec()
  await db.exec(bootstrap);
  await db.exec(seed);

  async function withUser<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
    // SET ROLE to a non-superuser so RLS actually fires (postgres
    // superuser has BYPASSRLS and FORCE doesn't override that). Set
    // app.current_user_id so auth.uid() resolves to the caller.
    const v = userId ?? '';
    await db.query(`SELECT set_config('app.current_user_id', $1, false)`, [v]);
    await db.query(`SET ROLE app_user`);
    try {
      return await fn();
    } finally {
      await db.query(`RESET ROLE`);
      await db.query(`SELECT set_config('app.current_user_id', '', false)`);
    }
  }

  async function query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
    const r = await db.query<T>(sql, params);
    return { rows: r.rows as T[] };
  }

  async function close() {
    await db.close();
  }

  return { db, withUser, query, close };
}

/** SHA-256 hex of a string — convenience for hand-constructing test events. */
export async function sha256Hex(s: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(s, 'utf8').digest('hex');
}
