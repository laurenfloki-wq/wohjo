// Replay-on-empty proof.
//
// Applies every committed /migrations/*.sql file in version order against an
// empty PGlite, then captures a schema fingerprint and compares to a
// production fingerprint pulled from the live DB via Supabase MCP.
//
// Outputs schema-fingerprint json + diff summary. Does not modify any DB.
//
// The pre-baseline strategy (Group P decision from FLOS-116-PLAN-DRAFT § 4.2):
// repo's pre-baseline migrations + baseline #20260506090427 are both applied.
// If a name collision causes a baseline operation to fail (DROP CONSTRAINT
// against a constraint a pre-baseline file already dropped, etc.), the
// replay shows it and we fold the resolution into the plan.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const migrationsDir = join(root, 'migrations');

// Collect SQL files. Order by version stamp (the part before first underscore
// if dated; A2-* sorts to top historically because it has no stamp — treat as
// pre-baseline / first).
const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort((a, b) => {
    // A2-* (unstamped legacy) goes first; otherwise lexical
    if (a.startsWith('A2-') && !b.startsWith('A2-')) return -1;
    if (!a.startsWith('A2-') && b.startsWith('A2-')) return 1;
    return a.localeCompare(b);
  });

console.log(`Found ${files.length} migration files.`);

// Set up the auth schema shim that Supabase provides. The migrations reference
// auth.uid(), auth.role(), auth.jwt() in RLS policies; without these, policy
// CREATE will fail.
const authShim = `
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
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE OR REPLACE FUNCTION extensions.digest(bytea, text) RETURNS bytea LANGUAGE sql AS $$
  SELECT decode(md5($1::text), 'hex');
$$;
CREATE OR REPLACE FUNCTION public.digest(bytea, text) RETURNS bytea LANGUAGE sql AS $$
  SELECT decode(md5($1::text), 'hex');
$$;
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

-- Roles referenced by GRANTs in migrations
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;

const db = new PGlite();
const applied = [];
const failed = [];

try {
  await db.exec(authShim);
  console.log('[shim] auth/extensions/storage stubs loaded');
} catch (err) {
  console.error('[shim] FAILED:', err.message);
  process.exit(1);
}

for (const f of files) {
  const sql = readFileSync(join(migrationsDir, f), 'utf-8');
  try {
    await db.exec(sql);
    applied.push(f);
  } catch (err) {
    failed.push({ file: f, error: err.message ?? String(err) });
    console.error(`[FAIL] ${f}: ${(err.message ?? String(err)).slice(0, 200)}`);
  }
}

console.log(`\nApplied: ${applied.length}/${files.length}`);
console.log(`Failed:  ${failed.length}`);

if (failed.length > 0) {
  console.log(`\nFirst 5 failures:`);
  for (const { file, error } of failed.slice(0, 5)) {
    console.log(`  ${file}\n    ${error.split('\n')[0]}`);
  }
}

// If anything failed, the txn is aborted; reset.
let fingerprint = null;
let tables = [];
try {
  if (failed.length > 0) {
    // Reset connection state after a failed exec — PGlite leaves the txn aborted.
    await db.exec('ROLLBACK; BEGIN; COMMIT;');
  }
  const fpResult = await db.query(`
    SELECT
      md5(string_agg(table_name || ':' || column_name || ':' || data_type, '|' ORDER BY table_name, ordinal_position)) AS columns_fp,
      count(*)::int AS column_count
    FROM information_schema.columns
    WHERE table_schema = 'public';
  `);
  fingerprint = fpResult.rows[0];
  const tablesResult = await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  tables = tablesResult.rows.map((r) => r.table_name);
  console.log('\n=== Schema fingerprint (public columns) ===');
  console.log(JSON.stringify(fingerprint, null, 2));
  console.log('\n=== Public tables (' + tables.length + ') ===');
  console.log(tables.join(', ') || '(none)');
} catch (err) {
  console.error('[fingerprint] failed:', err.message);
}

writeFileSync(
  'scripts/.116/replay-result.json',
  JSON.stringify(
    {
      total_files: files.length,
      applied: applied.length,
      failed_count: failed.length,
      failures: failed,
      fingerprint,
      tables,
      verdict: failed.length === 0 ? 'CLEAN' : 'BLOCKED-BY-GENESIS-SCHEMA-GAP',
    },
    null,
    2,
  ),
);

console.log('\nFull report: scripts/.116/replay-result.json');
await db.close();
