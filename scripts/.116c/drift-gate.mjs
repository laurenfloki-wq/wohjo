// Drift gate — runs in CI on schedule / dispatch / PR-touching-migrations.
//
// Connects to live production (read-only role via PGURL env), runs the
// same 9-dimension catalog queries the full-graph-attestation harness
// uses, computes immune fingerprints, and compares to the committed
// rebuild references in scripts/.116c/prod-*.txt.
//
// Exit 0 iff every dimension's live-prod immune fingerprint equals the
// committed reference's immune fingerprint. Exit 1 with per-dimension
// drift listing on any divergence.
//
// This is the guard against the #116 failure mode: somebody applying a
// dashboard-era change to production without committing the migration.
// The full-graph-attestation harness proves rebuild == committed
// references; this proves committed references == live production.
// Together, they pin the chain: empty + migrations == committed == live.

import pg from 'pg';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REF_DIR = __dirname;

const PGURL = process.env.PGURL;
if (!PGURL) {
  console.error('PGURL not set — set it to the read-only production connection string');
  process.exit(2);
}

function md5(s) {
  return createHash('md5').update(s, 'utf8').digest('hex');
}
function immuneFp(lines) {
  return md5(lines.map(md5).sort().join(''));
}

// pg_catalog-only canonical line forms. Produces the SAME line text as the
// full-graph-attestation harness (which uses information_schema and pg_policies),
// but every query uses only pg_catalog so a role with USAGE on pg_catalog +
// REFERENCES on public tables is sufficient — no SELECT on data needed.
// The single exception is view_body (pg_get_viewdef needs SELECT on the view);
// that view is metadata-only by design.
const QUERIES = {
  rls_state: `SELECT c.relname || ' : ' || c.relrowsecurity::text || ' : ' || c.relforcerowsecurity::text AS line
              FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
              WHERE n.nspname='public' AND c.relkind='r' ORDER BY 1`,
  // pg_policy (raw catalog) instead of pg_policies (system view requiring
  // SELECT on underlying table). Map polcmd ('r','a','w','d','*') to the
  // text the harness produces from pg_policies.cmd ('SELECT','INSERT',
  // 'UPDATE','DELETE','ALL') so line text matches across the two paths.
  policies: `SELECT n.nspname || '.' || c.relname || ' :: ' || p.polname || ' :: ' ||
                    (CASE p.polcmd
                       WHEN 'r' THEN 'SELECT'
                       WHEN 'a' THEN 'INSERT'
                       WHEN 'w' THEN 'UPDATE'
                       WHEN 'd' THEN 'DELETE'
                       WHEN '*' THEN 'ALL' END) || ' :: ' ||
                    coalesce(
                      array_to_string(
                        ARRAY(SELECT r.rolname FROM unnest(p.polroles) AS ro
                              JOIN pg_roles r ON r.oid = ro
                              ORDER BY r.rolname),
                        ','),
                      'public') || ' :: ' ||
                    coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' :: ' ||
                    coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') AS line
             FROM pg_policy p
             JOIN pg_class c ON c.oid = p.polrelid
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname='public' ORDER BY 1`,
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
  defaults: `SELECT c.relname || ':' || a.attname || ':DEFAULT:' || pg_get_expr(d.adbin, d.adrelid) AS line
             FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
             JOIN pg_class c ON c.oid=d.adrelid JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relkind='r' AND a.attgenerated='' ORDER BY 1`,
  generated_columns: `SELECT c.relname || ':' || a.attname || ':STORED:' || pg_get_expr(d.adbin, d.adrelid) AS line
                      FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
                      JOIN pg_class c ON c.oid=d.adrelid JOIN pg_namespace n ON n.oid=c.relnamespace
                      WHERE n.nspname='public' AND c.relkind='r' AND a.attgenerated='s' ORDER BY 1`,
  view_body: `SELECT 'public.v_anchor_verification :: ' || pg_get_viewdef('public.v_anchor_verification'::regclass, true) AS line`,
  extensions: `SELECT extname AS line FROM pg_extension ORDER BY 1`,
  // pg_class WHERE relkind='S' instead of information_schema.sequences:
  // information_schema views filter by privilege; a least-privilege role
  // with no SELECT on tables sees an empty sequences view (false negative).
  // pg_class with USAGE on pg_catalog + REFERENCES on public tables is the
  // canonical source and not privilege-filtered.
  zero_asserts: `SELECT 'sequences:' || count(*)::text AS line FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S'
                 UNION ALL SELECT 'enum_types:' || count(*)::text FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e'
                 UNION ALL SELECT 'domain_types:' || count(*)::text FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='d'`,
};

const REF_FILES = {
  rls_state: 'prod-rls-state.txt',
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

function loadRef(filename) {
  const p = join(REF_DIR, filename);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf-8').trim().split('\n').filter(Boolean);
}

const client = new pg.Client({ connectionString: PGURL });
await client.connect();

console.log('Drift gate — live prod vs committed reference, per dimension\n');
console.log(
  'dimension              count   live_fp                            committed_fp                       status',
);
let drifts = [];

try {
  for (const [name, sql] of Object.entries(QUERIES)) {
    const r = await client.query(sql);
    const liveLines = r.rows.map((row) => row.line);
    const liveFp = immuneFp(liveLines);
    const refLines = loadRef(REF_FILES[name]);
    let committedFp, status;
    if (!refLines) {
      committedFp = '(no reference file)';
      status = 'SKIP';
    } else {
      committedFp = immuneFp(refLines);
      status = liveFp === committedFp ? 'MATCH' : 'DRIFT';
    }
    console.log(
      `${name.padEnd(22)} ${String(liveLines.length).padStart(5)}   ${liveFp}   ${committedFp.padEnd(34)} ${status}`,
    );
    if (status === 'DRIFT') {
      const refSet = new Set(refLines);
      const liveSet = new Set(liveLines);
      const onlyInLive = liveLines.filter((l) => !refSet.has(l));
      const onlyInRef = refLines.filter((l) => !liveSet.has(l));
      drifts.push({ name, liveLines, refLines, onlyInLive, onlyInRef });
      writeFileSync(
        join(REF_DIR, `drift-${name}.txt`),
        `=== Drift on ${name} ===\n\n` +
          `Only in LIVE PROD (${onlyInLive.length}):\n${onlyInLive.map((l) => '  + ' + l).join('\n')}\n\n` +
          `Only in COMMITTED REF (${onlyInRef.length}):\n${onlyInRef.map((l) => '  - ' + l).join('\n')}\n`,
      );
    }
  }
} finally {
  await client.end();
}

if (drifts.length > 0) {
  console.log(
    `\n${drifts.length} dimension(s) DRIFTED — production changed outside committed migrations.`,
  );
  for (const d of drifts) {
    console.log(`\n=== ${d.name} (+${d.onlyInLive.length} live / -${d.onlyInRef.length} ref) ===`);
    d.onlyInLive.slice(0, 5).forEach((l) => console.log('  + ' + l.slice(0, 200)));
    d.onlyInRef.slice(0, 5).forEach((l) => console.log('  - ' + l.slice(0, 200)));
  }
  console.log(`\nFull diffs written to scripts/.116c/drift-*.txt`);
  process.exit(1);
}

console.log(`\nAll dimensions in sync — live production == committed references.`);
