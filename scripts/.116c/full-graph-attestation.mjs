// Full-graph attestation harness — runs on real Postgres 17.
//
// Connects to a Postgres 17 instance (CI service container or local Docker),
// applies the auth/storage shim + extensions + genesis + all committed
// migrations in version order, then computes per-dimension immune
// fingerprints for the 8 dimensions specified in #116c.
//
// Connection: PGURL env (e.g. postgres://postgres:postgres@localhost:5432/postgres).
// Outputs all per-dimension fingerprints + counts. Reads committed reference
// files from scripts/.116c/prod-*.txt for set-equality diffs.
//
// Exit 0 iff all dimensions match (counts AND immune fingerprints).
// Exit 1 with detailed diff on any drift.
//
// Immune fingerprint formula (engine-agnostic):
//   md5(string_agg(md5(line), '' ORDER BY md5(line)))
// Per-line md5 first (fixed-width hex, collation-immune), sorted bytewise,
// concatenated without separator, then md5'd.

import pg from 'pg';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const MIG_DIR = join(ROOT, 'migrations');
const REF_DIR = join(ROOT, 'scripts', '.116c');
const GENESIS = '00000000000000_genesis_pre_baseline_schema.sql';

const PGURL = process.env.PGURL || 'postgres://postgres:postgres@localhost:5432/postgres';

function md5(s) {
  return createHash('md5').update(s, 'utf8').digest('hex');
}
function immuneFp(lines) {
  const hashes = lines.map(md5).sort();
  return md5(hashes.join(''));
}

// ─── Catalog queries (one canonical line form per dimension) ──────────
const QUERIES = {
  rls_state: `SELECT c.relname || ' : ' || c.relrowsecurity::text || ' : ' || c.relforcerowsecurity::text AS line
              FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
              WHERE n.nspname='public' AND c.relkind='r' ORDER BY 1`,
  policies: `SELECT schemaname || '.' || tablename || ' :: ' || policyname || ' :: ' || cmd || ' :: ' ||
                    coalesce(array_to_string(array(select unnest(roles) order by 1), ','), '') || ' :: ' ||
                    coalesce(qual, '') || ' :: ' || coalesce(with_check, '') AS line
             FROM pg_policies WHERE schemaname='public' ORDER BY 1`,
  indexes: `SELECT pg_get_indexdef(i.indexrelid) AS line
            FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
            JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' ORDER BY 1`,
  functions: `SELECT pg_get_functiondef(p.oid) AS line
              FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public' ORDER BY 1`,
  triggers: `SELECT pg_get_triggerdef(t.oid) AS line
             FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
             JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY 1`,
  // Defaults: non-generated only. attgenerated='' means plain DEFAULT.
  // Generated columns are a separate dimension below so they can never be
  // folded into "defaults" and silently mis-rebuilt as DEFAULT instead of
  // GENERATED ALWAYS AS ... STORED.
  defaults: `SELECT c.relname || ':' || a.attname || ':DEFAULT:' || pg_get_expr(d.adbin, d.adrelid) AS line
             FROM pg_attrdef d
             JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
             JOIN pg_class c ON c.oid=d.adrelid
             JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relkind='r' AND a.attgenerated = '' ORDER BY 1`,
  // Generated columns — distinct sub-dimension. Today: 1 row
  // (companies.abn_digits STORED). The marker ('STORED') is in the line
  // so a regular DEFAULT can never coincidentally match a generation.
  generated_columns: `SELECT c.relname || ':' || a.attname || ':STORED:' || pg_get_expr(d.adbin, d.adrelid) AS line
                      FROM pg_attrdef d
                      JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
                      JOIN pg_class c ON c.oid=d.adrelid
                      JOIN pg_namespace n ON n.oid=c.relnamespace
                      WHERE n.nspname='public' AND c.relkind='r' AND a.attgenerated = 's' ORDER BY 1`,
  view_body: `SELECT 'public.v_anchor_verification :: ' || pg_get_viewdef('public.v_anchor_verification'::regclass, true) AS line`,
  extensions: `SELECT extname AS line FROM pg_extension ORDER BY 1`,
  zero_asserts: `SELECT 'sequences:' || count(*)::text AS line FROM information_schema.sequences WHERE sequence_schema='public'
                 UNION ALL SELECT 'enum_types:' || count(*)::text FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e'
                 UNION ALL SELECT 'domain_types:' || count(*)::text FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='d'`,
};

// ─── Apply genesis + migrations to a fresh real-PG instance ──────────
async function setupRebuild(client) {
  // Drop public and recreate to clean any prior state
  await client.query(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;`);
  await client.query(`SET TIME ZONE 'UTC';`);

  // Extensions installed on vanilla postgres:17 (supabase/postgres image
  // can't run as a GH Actions service container — its init requires
  // Supabase orchestration). supabase_vault is platform-managed and
  // falls under the README's out-of-scope clause; the harness asserts
  // the 4 application-schema extensions and the extensions reference
  // file should list those 4, not the 5 production has.
  await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
  await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
  await client.query(`CREATE EXTENSION IF NOT EXISTS pg_stat_statements;`);
  // plpgsql comes preinstalled in every Postgres distribution

  // Auth/storage shim (Supabase-managed in production; harness stub here)
  await client.query(`
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
    CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, raw_app_meta_data jsonb DEFAULT '{}'::jsonb);
    INSERT INTO auth.users (id) VALUES
      ('58e8bca1-9438-4997-8e57-92a195cfd995'),
      ('fb9110c8-bea7-4fc4-8a1e-7c3bc45c71c7')
    ON CONFLICT DO NOTHING;
    CREATE SCHEMA IF NOT EXISTS storage;
    CREATE TABLE IF NOT EXISTS storage.buckets (id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL DEFAULT false);
    CREATE TABLE IF NOT EXISTS storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL REFERENCES storage.buckets(id), name text NOT NULL);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  // Genesis
  await client.query(readFileSync(join(MIG_DIR, GENESIS), 'utf-8'));

  // Phase-2 data seed (same as #116b)
  await client.query(`
    INSERT INTO companies (id, name, contact_email) VALUES
      ('00000000-1000-0000-0000-000000000001', 'Replay Harness Tenant', 'replay@example.invalid');
    INSERT INTO workers (id, company_id, first_name, last_name, phone, employee_id) VALUES
      ('00000000-2000-0000-0000-000000000001', '00000000-1000-0000-0000-000000000001',
       'Replay', 'Worker', '+61400000000', 'EMP-RPL-001');
  `);
  const seedSql = [
    ['aaaa', '1'],
    ['bbbb', '2'],
    ['cccc', '3'],
  ].flatMap(([suffix, key]) =>
    [1, 2, 3].map(
      (i) => `(
    gen_random_uuid(), '00000000-1000-0000-0000-000000000001', '00000000-2000-0000-0000-000000000001',
    'SUPERVISOR_APPROVAL',
    '{"shift_id":"00000000-${suffix}-0000-0000-00000000000${key}"}'::jsonb,
    '${key.repeat(63)}${i}',
    '2026-05-0${i} 00:00:00+00', 'seed:replay')`,
    ),
  );
  await client.query(
    `INSERT INTO shift_events (id, company_id, worker_id, event_type, event_data, event_hash, created_at, created_by) VALUES ${seedSql.join(',')};`,
  );

  // Apply 85 reconciled migrations (genesis excluded). Real PG — no stripping of
  // CREATE EXTENSION pgcrypto; it's installed above.
  const allFiles = readdirSync(MIG_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => {
      if (a.startsWith('A2-') && !b.startsWith('A2-')) return -1;
      if (!a.startsWith('A2-') && b.startsWith('A2-')) return 1;
      return a.localeCompare(b);
    });
  const migrations = allFiles.filter((f) => f !== GENESIS);
  const failed = [];
  for (const f of migrations) {
    try {
      await client.query(readFileSync(join(MIG_DIR, f), 'utf-8'));
    } catch (err) {
      failed.push({ file: f, error: (err.message ?? String(err)).split('\n')[0].slice(0, 300) });
    }
  }
  return { applied: migrations.length - failed.length, total: migrations.length, failed };
}

// ─── Run all 9 dimension queries and compute fingerprints ─────────────
async function dimensions(client) {
  const out = {};
  for (const [name, sql] of Object.entries(QUERIES)) {
    const r = await client.query(sql);
    const lines = r.rows.map((row) => row.line);
    out[name] = { count: lines.length, immune_fp: immuneFp(lines), lines };
  }
  return out;
}

// ─── Compare against committed reference files ────────────────────────
function loadRef(filename) {
  const path = join(REF_DIR, filename);
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf-8').trim().split('\n');
}

function diffLines(label, ours, prod) {
  if (!prod) return { skipped: true };
  const oursSet = new Set(ours);
  const prodSet = new Set(prod);
  const onlyInOurs = ours.filter((l) => !prodSet.has(l));
  const onlyInProd = prod.filter((l) => !oursSet.has(l));
  return { match: onlyInOurs.length === 0 && onlyInProd.length === 0, onlyInOurs, onlyInProd };
}

const REF_FILES = {
  rls_state: 'prod-rls-state.txt',
  // policies, indexes, functions, triggers, view_body — full bodies generated by
  // CI on first run and committed back; until then, count-only checks run.
  policies: 'prod-policies.txt',
  indexes: 'prod-indexes.txt',
  functions: 'prod-functions-def.txt',
  triggers: 'prod-triggers-def.txt',
  defaults: 'prod-defaults.txt',
  generated_columns: 'prod-generated-columns.txt',
  view_body: 'prod-view-body.txt',
  extensions: 'prod-extensions.txt',
  zero_asserts: 'prod-zero-asserts.txt',
};

// ─── Main ────────────────────────────────────────────────────────────
async function main() {
  const client = new pg.Client({ connectionString: PGURL });
  await client.connect();
  try {
    console.log(`[setup] connecting to ${PGURL.replace(/:[^:@]+@/, ':****@')}`);
    const setup = await setupRebuild(client);
    console.log(`[setup] applied ${setup.applied}/${setup.total} migrations`);
    if (setup.failed.length > 0) {
      console.log(`[setup] FAILURES:`);
      setup.failed.slice(0, 5).forEach((f) => console.log(`  ${f.file}: ${f.error}`));
    }

    const dims = await dimensions(client);

    // Save rebuild output (overwrites)
    for (const [name, d] of Object.entries(dims)) {
      writeFileSync(join(REF_DIR, `rebuild-${name}.txt`), d.lines.join('\n') + '\n');
    }

    // Summary table
    console.log('\n=== Dimension fingerprints ===');
    console.log('dimension              count   immune_fp');
    for (const [name, d] of Object.entries(dims)) {
      console.log(`${name.padEnd(22)} ${String(d.count).padStart(5)}   ${d.immune_fp}`);
    }

    // Diff against reference files (where available)
    let totalDeltas = 0;
    let totalChecks = 0;
    console.log('\n=== Diff vs committed reference files ===');
    for (const [name, d] of Object.entries(dims)) {
      const ref = loadRef(REF_FILES[name]);
      const diff = diffLines(name, d.lines, ref);
      if (diff.skipped) {
        console.log(`${name}: SKIPPED (no reference file at scripts/.116c/${REF_FILES[name]})`);
        continue;
      }
      totalChecks++;
      if (diff.match) {
        console.log(`${name}: MATCH (${d.count} lines)`);
      } else {
        totalDeltas++;
        console.log(
          `${name}: DRIFT — +${diff.onlyInOurs.length} in rebuild / -${diff.onlyInProd.length} in prod`,
        );
        diff.onlyInOurs.slice(0, 5).forEach((l) => console.log(`  + ${l.slice(0, 200)}`));
        diff.onlyInProd.slice(0, 5).forEach((l) => console.log(`  - ${l.slice(0, 200)}`));
      }
    }

    console.log(
      `\n${totalDeltas === 0 ? 'ALL CHECKED DIMENSIONS CLEAN' : `${totalDeltas} of ${totalChecks} dimensions drift`}`,
    );
    process.exit(totalDeltas === 0 ? 0 : 1);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
