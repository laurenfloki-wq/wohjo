// Replay loop: empty + (auth/storage shim) + genesis + 88 committed migrations.
// Reports the FIRST failure with file + error so iteration is fast.
//
// Usage: node scripts/.116b/replay-loop.mjs
//   - Reads migrations/00000000000000_genesis_pre_baseline_schema.sql as genesis
//   - Reads all other migrations/*.sql in version order
//   - Reports applied count, first failure, total failures
//
// On clean pass (88+1 applied), captures schema fingerprint for comparison.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const migrationsDir = join(root, 'migrations');
const GENESIS = '00000000000000_genesis_pre_baseline_schema.sql';

const allFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort((a, b) => {
    if (a.startsWith('A2-') && !b.startsWith('A2-')) return -1;
    if (!a.startsWith('A2-') && b.startsWith('A2-')) return 1;
    return a.localeCompare(b);
  });

const shim = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('request.jwt.claim.role', true), 'anon');
$$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('request.jwt.claims', true), '{}')::jsonb;
$$;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb
);
-- Seed the 2 founding auth.users phase_2 (20260507034128) pre-flights on.
-- In production these existed at apply time. The empty-replay harness
-- needs them or phase_2's "expected 2 users" guard aborts.
INSERT INTO auth.users (id) VALUES
  ('58e8bca1-9438-4997-8e57-92a195cfd995'),
  ('fb9110c8-bea7-4fc4-8a1e-7c3bc45c71c7')
ON CONFLICT DO NOTHING;
CREATE SCHEMA IF NOT EXISTS extensions;
-- digest() stub; not byte-identical to pgcrypto but lets migrations parse + run
CREATE OR REPLACE FUNCTION extensions.digest(bytea, text) RETURNS bytea LANGUAGE sql AS $$
  SELECT decode(md5($1::text), 'hex');
$$;
CREATE OR REPLACE FUNCTION public.digest(bytea, text) RETURNS bytea LANGUAGE sql AS $$
  SELECT decode(md5($1::text), 'hex');
$$;
-- Make CREATE EXTENSION pgcrypto a no-op (PGlite doesn't have it)
CREATE OR REPLACE FUNCTION pg_catalog.pg_extension_create_stub() RETURNS void
LANGUAGE sql AS $$ SELECT NULL::void $$;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL REFERENCES storage.buckets(id),
  name text NOT NULL
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;

const db = new PGlite();
await db.exec(shim);

// Apply genesis first (if it exists)
const genesisPath = join(migrationsDir, GENESIS);
let genesisApplied = false;
try {
  const genesis = readFileSync(genesisPath, 'utf-8');
  await db.exec(genesis);
  genesisApplied = true;
  console.log('[genesis] applied');
} catch (err) {
  console.error('[genesis] FAILED:', (err.message ?? String(err)).slice(0, 400));
  process.exit(1);
}

// Seed data the post-baseline migrations have hard pre-flight asserts on.
// In production these were satisfied by accumulated state at apply time.
// Empty replay needs them or the assert RAISES.
//
//   phase_2 (20260507034128) "Tag step": expects exactly 6 historical
//   SUPERVISOR_APPROVAL duplicates per shift_id (older than the latest).
//   Seed: 1 company + 1 worker + 9 SUPERVISOR_APPROVAL events across 3
//   shift_ids (3 events each → newest stays, 2 older per shift = 6 total).
await db.exec(`
INSERT INTO companies (id, name, contact_email) VALUES
  ('00000000-1000-0000-0000-000000000001', 'Replay Harness Tenant', 'replay@example.invalid');
INSERT INTO workers (id, company_id, first_name, last_name, phone, employee_id) VALUES
  ('00000000-2000-0000-0000-000000000001', '00000000-1000-0000-0000-000000000001',
   'Replay', 'Worker', '+61400000000', 'EMP-RPL-001');
INSERT INTO shift_events (id, company_id, worker_id, event_type, event_data, event_hash, created_at, created_by) VALUES
  -- shift_id alpha — 3 SUPERVISOR_APPROVAL events
  (gen_random_uuid(), '00000000-1000-0000-0000-000000000001', '00000000-2000-0000-0000-000000000001',
   'SUPERVISOR_APPROVAL', '{"shift_id":"00000000-aaaa-0000-0000-000000000001"}'::jsonb,
   '1111111111111111111111111111111111111111111111111111111111111111',
   '2026-05-01 00:00:00+00', 'seed:replay'),
  (gen_random_uuid(), '00000000-1000-0000-0000-000000000001', '00000000-2000-0000-0000-000000000001',
   'SUPERVISOR_APPROVAL', '{"shift_id":"00000000-aaaa-0000-0000-000000000001"}'::jsonb,
   '1111111111111111111111111111111111111111111111111111111111111112',
   '2026-05-02 00:00:00+00', 'seed:replay'),
  (gen_random_uuid(), '00000000-1000-0000-0000-000000000001', '00000000-2000-0000-0000-000000000001',
   'SUPERVISOR_APPROVAL', '{"shift_id":"00000000-aaaa-0000-0000-000000000001"}'::jsonb,
   '1111111111111111111111111111111111111111111111111111111111111113',
   '2026-05-03 00:00:00+00', 'seed:replay'),
  -- shift_id beta — 3 SUPERVISOR_APPROVAL events
  (gen_random_uuid(), '00000000-1000-0000-0000-000000000001', '00000000-2000-0000-0000-000000000001',
   'SUPERVISOR_APPROVAL', '{"shift_id":"00000000-bbbb-0000-0000-000000000002"}'::jsonb,
   '2222222222222222222222222222222222222222222222222222222222222221',
   '2026-05-01 00:00:00+00', 'seed:replay'),
  (gen_random_uuid(), '00000000-1000-0000-0000-000000000001', '00000000-2000-0000-0000-000000000001',
   'SUPERVISOR_APPROVAL', '{"shift_id":"00000000-bbbb-0000-0000-000000000002"}'::jsonb,
   '2222222222222222222222222222222222222222222222222222222222222222',
   '2026-05-02 00:00:00+00', 'seed:replay'),
  (gen_random_uuid(), '00000000-1000-0000-0000-000000000001', '00000000-2000-0000-0000-000000000001',
   'SUPERVISOR_APPROVAL', '{"shift_id":"00000000-bbbb-0000-0000-000000000002"}'::jsonb,
   '2222222222222222222222222222222222222222222222222222222222222223',
   '2026-05-03 00:00:00+00', 'seed:replay'),
  -- shift_id gamma — 3 SUPERVISOR_APPROVAL events
  (gen_random_uuid(), '00000000-1000-0000-0000-000000000001', '00000000-2000-0000-0000-000000000001',
   'SUPERVISOR_APPROVAL', '{"shift_id":"00000000-cccc-0000-0000-000000000003"}'::jsonb,
   '3333333333333333333333333333333333333333333333333333333333333331',
   '2026-05-01 00:00:00+00', 'seed:replay'),
  (gen_random_uuid(), '00000000-1000-0000-0000-000000000001', '00000000-2000-0000-0000-000000000001',
   'SUPERVISOR_APPROVAL', '{"shift_id":"00000000-cccc-0000-0000-000000000003"}'::jsonb,
   '3333333333333333333333333333333333333333333333333333333333333332',
   '2026-05-02 00:00:00+00', 'seed:replay'),
  (gen_random_uuid(), '00000000-1000-0000-0000-000000000001', '00000000-2000-0000-0000-000000000001',
   'SUPERVISOR_APPROVAL', '{"shift_id":"00000000-cccc-0000-0000-000000000003"}'::jsonb,
   '3333333333333333333333333333333333333333333333333333333333333333',
   '2026-05-03 00:00:00+00', 'seed:replay');
`);

// Apply remaining migrations in order
const migrations = allFiles.filter((f) => f !== GENESIS);
const applied = [];
const failed = [];

// Harness-only SQL preprocessing. The committed files (and their md5s)
// are unchanged on disk — this only adjusts the byte stream PGlite sees
// because it doesn't ship pgcrypto. Production has pgcrypto installed.
function harnessPreprocess(sql) {
  return sql
    .replace(
      /CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+pgcrypto\s*;/gi,
      '-- pgcrypto stubbed by harness',
    )
    .replace(/CREATE\s+EXTENSION\s+pgcrypto\s*;/gi, '-- pgcrypto stubbed by harness');
}

for (const f of migrations) {
  const sql = harnessPreprocess(readFileSync(join(migrationsDir, f), 'utf-8'));
  try {
    await db.exec(sql);
    applied.push(f);
  } catch (err) {
    failed.push({ file: f, error: (err.message ?? String(err)).split('\n')[0].slice(0, 300) });
    // Stop on first failure — iteration is faster that way
    break;
  }
}

console.log(`\nGenesis: ${genesisApplied ? 'OK' : 'FAIL'}`);
console.log(`Migrations applied: ${applied.length}/${migrations.length}`);
console.log(`Failed: ${failed.length}`);

if (failed.length > 0) {
  console.log(`\nFIRST FAILURE:`);
  for (const { file, error } of failed) {
    console.log(`  ${file}`);
    console.log(`    ${error}`);
  }
}

if (failed.length === 0) {
  // Capture schema fingerprint + full column list for diff vs production
  try {
    const fp = await db.query(`
      SELECT
        md5(string_agg(table_name || ':' || column_name || ':' || data_type, '|' ORDER BY table_name, ordinal_position)) AS fp,
        count(*)::int AS n
      FROM information_schema.columns WHERE table_schema = 'public';
    `);
    const tables = await db.query(`
      SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name
    `);
    const cols = await db.query(`
      SELECT table_name || ':' || column_name || ':' || data_type AS col
      FROM information_schema.columns WHERE table_schema='public'
      ORDER BY table_name, column_name
    `);
    console.log(`\nAll ${applied.length + 1} applied cleanly.`);
    console.log(`Schema fingerprint: ${JSON.stringify(fp.rows[0])}`);
    writeFileSync(
      'scripts/.116b/replay-columns.txt',
      cols.rows.map((r) => r.col).join('\n') + '\n',
    );
    writeFileSync(
      'scripts/.116b/replay-result.json',
      JSON.stringify(
        {
          applied: applied.length + 1,
          fingerprint: fp.rows[0],
          tables: tables.rows.map((r) => r.table_name),
        },
        null,
        2,
      ),
    );

    // Constraints
    const conResult = await db.query(`
      SELECT conrelid::regclass::text || ':' || conname AS c
      FROM pg_constraint
      WHERE connamespace='public'::regnamespace AND contype IN ('p','u','c','f')
      ORDER BY 1
    `);
    writeFileSync(
      'scripts/.116b/replay-constraints.txt',
      conResult.rows.map((r) => r.c).join('\n') + '\n',
    );

    function diffSets(name, prodFile, oursList) {
      try {
        const prod = readFileSync(prodFile, 'utf-8').trim().split('\n').sort();
        const ours = [...oursList].sort();
        const prodSet = new Set(prod);
        const oursSet = new Set(ours);
        const onlyInReplay = ours.filter((c) => !prodSet.has(c));
        const onlyInProd = prod.filter((c) => !oursSet.has(c));
        console.log(`\n=== ${name} diff (replay vs production) ===`);
        console.log(`Only in replay (${onlyInReplay.length}):`);
        onlyInReplay.forEach((c) => console.log('  + ' + c));
        console.log(`Only in production (${onlyInProd.length}):`);
        onlyInProd.forEach((c) => console.log('  - ' + c));
        return onlyInReplay.length + onlyInProd.length;
      } catch (e) {
        return null;
      }
    }
    const colDelta = diffSets(
      'Columns',
      'scripts/.116b/prod-columns.txt',
      cols.rows.map((r) => r.col),
    );
    const conDelta = diffSets(
      'Constraints',
      'scripts/.116b/prod-constraints.txt',
      conResult.rows.map((r) => r.c),
    );
    console.log(
      `\n=== TOTAL DELTA: columns ${colDelta ?? '?'}, constraints ${conDelta ?? '?'} ===`,
    );
  } catch (err) {
    console.error('[fingerprint] failed:', err.message);
  }
}

await db.close();
process.exit(failed.length === 0 ? 0 : 1);
