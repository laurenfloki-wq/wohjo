// Re-attestation: reproduce chat-Claude's three set-equality checks
// against the rebuild (empty + shim + genesis + 85 migrations).
//
// Targets:
//   relations:     26 (incl. v_anchor_verification view)
//   column_fp:     e9aa2888cf558480ef7266f3517becf7
//   constraint_fp: a55a0057054e416a3019dbf60462f696
//
// On mismatch, diff against the references in scripts/.116b/prod-*.txt
// and localise the offending row.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const migrationsDir = join(root, 'migrations');
const GENESIS = '00000000000000_genesis_pre_baseline_schema.sql';

// Same shim/preprocess as replay-loop.mjs (kept in sync by hand)
const allFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort((a, b) => {
    if (a.startsWith('A2-') && !b.startsWith('A2-')) return -1;
    if (!a.startsWith('A2-') && b.startsWith('A2-')) return 1;
    return a.localeCompare(b);
  });

const db = new PGlite();
// Force UTC so timestamptz literals render the same way they do in
// production (which is UTC-configured). Without this, pg_get_constraintdef
// emits the local zone offset (e.g. +10 for AEST), producing a benign
// text difference from production's +00 rendering.
await db.exec(`SET TIME ZONE 'UTC';`);

// Inline shim (mirror of replay-loop.mjs)
await db.exec(`
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
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE OR REPLACE FUNCTION extensions.digest(bytea, text) RETURNS bytea LANGUAGE sql AS $$
  SELECT decode(md5($1::text), 'hex');
$$;
CREATE OR REPLACE FUNCTION public.digest(bytea, text) RETURNS bytea LANGUAGE sql AS $$
  SELECT decode(md5($1::text), 'hex');
$$;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL REFERENCES storage.buckets(id), name text NOT NULL);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`);

// Genesis
await db.exec(readFileSync(join(migrationsDir, GENESIS), 'utf-8'));

// Phase 2 data seed
await db.exec(`
INSERT INTO companies (id, name, contact_email) VALUES
  ('00000000-1000-0000-0000-000000000001', 'Replay Harness Tenant', 'replay@example.invalid');
INSERT INTO workers (id, company_id, first_name, last_name, phone, employee_id) VALUES
  ('00000000-2000-0000-0000-000000000001', '00000000-1000-0000-0000-000000000001',
   'Replay', 'Worker', '+61400000000', 'EMP-RPL-001');
`);
// Build seed events
const seedEvents = [];
let n = 0;
for (const [letter, suffix] of [
  ['a', 'aaaa'],
  ['b', 'bbbb'],
  ['c', 'cccc'],
]) {
  for (let i = 1; i <= 3; i++) {
    n++;
    seedEvents.push(`(gen_random_uuid(), '00000000-1000-0000-0000-000000000001', '00000000-2000-0000-0000-000000000001',
   'SUPERVISOR_APPROVAL', '{"shift_id":"00000000-${suffix}-0000-0000-00000000000${letter === 'a' ? '1' : letter === 'b' ? '2' : '3'}"}'::jsonb,
   '${letter.charCodeAt(0).toString().repeat(32).slice(0, 63)}${i}',
   '2026-05-0${i} 00:00:00+00', 'seed:replay')`);
  }
}
await db.exec(`INSERT INTO shift_events (id, company_id, worker_id, event_type, event_data, event_hash, created_at, created_by) VALUES
  ${[
    `(gen_random_uuid(),'00000000-1000-0000-0000-000000000001','00000000-2000-0000-0000-000000000001','SUPERVISOR_APPROVAL','{"shift_id":"00000000-aaaa-0000-0000-000000000001"}'::jsonb,'1111111111111111111111111111111111111111111111111111111111111111','2026-05-01 00:00:00+00','seed:replay')`,
    `(gen_random_uuid(),'00000000-1000-0000-0000-000000000001','00000000-2000-0000-0000-000000000001','SUPERVISOR_APPROVAL','{"shift_id":"00000000-aaaa-0000-0000-000000000001"}'::jsonb,'1111111111111111111111111111111111111111111111111111111111111112','2026-05-02 00:00:00+00','seed:replay')`,
    `(gen_random_uuid(),'00000000-1000-0000-0000-000000000001','00000000-2000-0000-0000-000000000001','SUPERVISOR_APPROVAL','{"shift_id":"00000000-aaaa-0000-0000-000000000001"}'::jsonb,'1111111111111111111111111111111111111111111111111111111111111113','2026-05-03 00:00:00+00','seed:replay')`,
    `(gen_random_uuid(),'00000000-1000-0000-0000-000000000001','00000000-2000-0000-0000-000000000001','SUPERVISOR_APPROVAL','{"shift_id":"00000000-bbbb-0000-0000-000000000002"}'::jsonb,'2222222222222222222222222222222222222222222222222222222222222221','2026-05-01 00:00:00+00','seed:replay')`,
    `(gen_random_uuid(),'00000000-1000-0000-0000-000000000001','00000000-2000-0000-0000-000000000001','SUPERVISOR_APPROVAL','{"shift_id":"00000000-bbbb-0000-0000-000000000002"}'::jsonb,'2222222222222222222222222222222222222222222222222222222222222222','2026-05-02 00:00:00+00','seed:replay')`,
    `(gen_random_uuid(),'00000000-1000-0000-0000-000000000001','00000000-2000-0000-0000-000000000001','SUPERVISOR_APPROVAL','{"shift_id":"00000000-bbbb-0000-0000-000000000002"}'::jsonb,'2222222222222222222222222222222222222222222222222222222222222223','2026-05-03 00:00:00+00','seed:replay')`,
    `(gen_random_uuid(),'00000000-1000-0000-0000-000000000001','00000000-2000-0000-0000-000000000001','SUPERVISOR_APPROVAL','{"shift_id":"00000000-cccc-0000-0000-000000000003"}'::jsonb,'3333333333333333333333333333333333333333333333333333333333333331','2026-05-01 00:00:00+00','seed:replay')`,
    `(gen_random_uuid(),'00000000-1000-0000-0000-000000000001','00000000-2000-0000-0000-000000000001','SUPERVISOR_APPROVAL','{"shift_id":"00000000-cccc-0000-0000-000000000003"}'::jsonb,'3333333333333333333333333333333333333333333333333333333333333332','2026-05-02 00:00:00+00','seed:replay')`,
    `(gen_random_uuid(),'00000000-1000-0000-0000-000000000001','00000000-2000-0000-0000-000000000001','SUPERVISOR_APPROVAL','{"shift_id":"00000000-cccc-0000-0000-000000000003"}'::jsonb,'3333333333333333333333333333333333333333333333333333333333333333','2026-05-03 00:00:00+00','seed:replay')`,
  ].join(',')};`);

// Apply 85 reconciled migrations
const migs = allFiles.filter((f) => f !== GENESIS);
function preprocess(sql) {
  return sql
    .replace(/CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+pgcrypto\s*;/gi, '-- stubbed')
    .replace(/CREATE\s+EXTENSION\s+pgcrypto\s*;/gi, '-- stubbed');
}
for (const f of migs) {
  await db.exec(preprocess(readFileSync(join(migrationsDir, f), 'utf-8')));
}

// === Check 1: relations (no type filter, like chat-Claude's first query) ===
const rels = await db.query(
  `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`,
);
console.log(`Relations (${rels.rows.length}):`);
rels.rows.forEach((r) => console.log('  ' + r.table_name + '  [' + r.table_type + ']'));

// === Check 2: column_fp (chat-Claude's exact formula) ===
const colFp = await db.query(
  `SELECT md5(string_agg(table_name||':'||column_name||':'||data_type, chr(10) ORDER BY table_name||':'||column_name||':'||data_type)) AS fp FROM information_schema.columns WHERE table_schema='public'`,
);
const colList = await db.query(
  `SELECT table_name||':'||column_name||':'||data_type AS line FROM information_schema.columns WHERE table_schema='public' ORDER BY 1`,
);
console.log(`\nColumn count: ${colList.rows.length}`);
console.log(`Column FP:    ${colFp.rows[0].fp}`);
console.log(`Expected:     e9aa2888cf558480ef7266f3517becf7`);

// === Check 3: constraint_fp (chat-Claude's exact formula, name-independent) ===
const conFp = await db.query(
  `SELECT md5(string_agg(conrelid::regclass::text||' '||pg_get_constraintdef(oid), chr(10) ORDER BY conrelid::regclass::text||' '||pg_get_constraintdef(oid))) AS fp FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype IN ('p','u','c','f')`,
);
const conList = await db.query(
  `SELECT conrelid::regclass::text||' '||pg_get_constraintdef(oid) AS line FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype IN ('p','u','c','f') ORDER BY 1`,
);
console.log(`\nConstraint count: ${conList.rows.length}`);
console.log(`Constraint FP:    ${conFp.rows[0].fp}`);
console.log(`Expected:         a55a0057054e416a3019dbf60462f696`);

// Save full rebuild output for diffing
writeFileSync(
  'scripts/.116b/rebuild-constraints-def.txt',
  conList.rows.map((r) => r.line).join('\n') + '\n',
);
writeFileSync(
  'scripts/.116b/rebuild-columns.txt',
  colList.rows.map((r) => r.line).join('\n') + '\n',
);
writeFileSync(
  'scripts/.116b/rebuild-relations.txt',
  rels.rows.map((r) => `${r.table_name}  [${r.table_type}]`).join('\n') + '\n',
);

// === Diff constraints against the 106-line reference (chat-Claude paste) ===
const prodConstraintsRef = readFileSync('scripts/.116b/prod-constraints-def.txt', 'utf-8')
  .trim()
  .split('\n');
const ours = conList.rows.map((r) => r.line);
const prodSet = new Set(prodConstraintsRef);
const oursSet = new Set(ours);
const onlyInRebuild = ours.filter((c) => !prodSet.has(c));
const onlyInProd = prodConstraintsRef.filter((c) => !oursSet.has(c));
console.log(`\n=== Constraint def diff (rebuild vs production) ===`);
console.log(`Only in rebuild (${onlyInRebuild.length}):`);
onlyInRebuild.forEach((c) => console.log('  + ' + c));
console.log(`Only in production (${onlyInProd.length}):`);
onlyInProd.forEach((c) => console.log('  - ' + c));

await db.close();
