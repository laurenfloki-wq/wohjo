// SG-2 / Dispatch 2 C — cross-tenant RLS probe + FORCE RLS validation.
//
// Runs on real Postgres 17 (CI service container), reusing the
// full-graph-attestation rebuild recipe: auth/storage shim + genesis +
// all committed migrations. Then:
//
//   1. Seeds two tenants (alpha, bravo) with an admin user each.
//   2. PROBES tenant isolation through the actual RLS policies:
//        - authenticated as alpha-admin sees ONLY alpha rows
//          (companies via app_metadata.company_id; workers /
//          shift_events via the admins join on auth.uid())
//        - write probes: cross-tenant INSERT/UPDATE are denied
//        - anon sees nothing
//        - service_role (BYPASSRLS, prod parity) sees everything
//   3. Applies FORCE ROW LEVEL SECURITY to every public table and
//      asserts the probe matrix is UNCHANGED (FORCE only affects
//      table owners — app roles must be unaffected).
//   4. Demonstrates the owner semantics on a sacrificial table owned
//      by a non-superuser role: ENABLE leaves the owner exempt;
//      FORCE blinds the owner. This is the prod-impact evidence for
//      the FORCE-RLS decision (Supabase's `postgres` role is a
//      non-superuser table owner — FORCE would blind SQL-editor/MCP
//      tooling unless owner policies are added).
//
// Exit 0 iff all isolation probes pass before AND after FORCE.
// The owner demo is informational (printed, not asserted against prod).
//
// NOTE (plan constraint): Supabase branching needs Pro — this real-PG
// rebuild is the isolated FORCE-RLS validation environment instead.

import pg from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const MIG_DIR = join(ROOT, 'migrations');
const GENESIS = '00000000000000_genesis_pre_baseline_schema.sql';
const PGURL = process.env.PGURL || 'postgres://postgres:postgres@localhost:5432/postgres';

const T = {
  alpha: {
    company: '00000000-aaaa-0000-0000-00000000000a',
    admin: '00000000-aaaa-0000-0000-0000000000ad',
    worker: '00000000-aaaa-0000-0000-0000000000aa',
  },
  bravo: {
    company: '00000000-bbbb-0000-0000-00000000000b',
    admin: '00000000-bbbb-0000-0000-0000000000ad',
    worker: '00000000-bbbb-0000-0000-0000000000bb',
  },
};

let failures = 0;
function check(label, cond, detail = '') {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// ─── Rebuild (same recipe as full-graph-attestation.mjs) ─────────────
async function setupRebuild(client) {
  await client.query(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;`);
  await client.query(`SET TIME ZONE 'UTC';`);
  await client.query(`CREATE SCHEMA IF NOT EXISTS extensions;`);
  await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;`);
  await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;`);
  await client.query(`CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;`);
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
      ('fb9110c8-bea7-4fc4-8a1e-7c3bc45c71c7'),
      ('${T.alpha.admin}'),
      ('${T.bravo.admin}')
    ON CONFLICT DO NOTHING;
    CREATE SCHEMA IF NOT EXISTS storage;
    CREATE TABLE IF NOT EXISTS storage.buckets (id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL DEFAULT false);
    CREATE TABLE IF NOT EXISTS storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL REFERENCES storage.buckets(id), name text NOT NULL);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    -- Prod parity: Supabase's service_role carries BYPASSRLS.
    ALTER ROLE service_role BYPASSRLS;
    -- Prod parity: Supabase grants schema usage + table privileges to the
    -- app roles by DEFAULT PRIVILEGES; RLS does the row gating. Declared
    -- BEFORE genesis so tables created by migrations inherit the grants
    -- and later per-table REVOKEs (export_packs, notification_dead_letter)
    -- still land exactly as they do in production.
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT ALL ON TABLES TO anon, authenticated, service_role;
  `);
  await client.query(readFileSync(join(MIG_DIR, GENESIS), 'utf-8'));
  const allFiles = readdirSync(MIG_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => {
      if (a.startsWith('A2-') && !b.startsWith('A2-')) return -1;
      if (!a.startsWith('A2-') && b.startsWith('A2-')) return 1;
      return a.localeCompare(b);
    })
    .filter((f) => f !== GENESIS);
  let applied = 0;
  for (const f of allFiles) {
    try {
      await client.query(readFileSync(join(MIG_DIR, f), 'utf-8'));
      applied++;
    } catch (err) {
      console.log(`  [migration skip] ${f}: ${(err.message ?? '').split('\n')[0].slice(0, 160)}`);
    }
  }
  console.log(`[setup] applied ${applied}/${allFiles.length} migrations`);
}

async function seedTenants(client) {
  for (const [name, t] of Object.entries(T)) {
    await client.query(
      `INSERT INTO public.companies (id, name, contact_email) VALUES ($1, $2, $3)`,
      [t.company, `Probe ${name}`, `${name}@probe.invalid`],
    );
    await client.query(
      `INSERT INTO public.admins (user_id, company_id, role) VALUES ($1, $2, 'director')`,
      [t.admin, t.company],
    );
    await client.query(
      `INSERT INTO public.workers (id, company_id, first_name, last_name, phone, employee_id)
       VALUES ($1, $2, $3, 'Probe', $4, $5)`,
      [t.worker, t.company, name, name === 'alpha' ? '+61400000801' : '+61400000802', `EMP-PROBE-${name}`],
    );
    // created_at predates the WLES v1 cutover (same trick as the
    // attestation seed) so shift_events_post_cutover_spec_v1 accepts a
    // spec-0 probe row.
    await client.query(
      `INSERT INTO public.shift_events (company_id, worker_id, event_type, event_data, event_hash, created_at, created_by)
       VALUES ($1, $2, 'SUPERVISOR_APPROVAL', '{"probe":true}'::jsonb, $3, '2026-05-01 00:00:00+00', 'probe:sg2')`,
      [t.company, t.worker, (name === 'alpha' ? 'a' : 'b').repeat(64)],
    );
  }
  console.log('[seed] tenants alpha + bravo seeded');
}

// Run a query inside a SET LOCAL role/claims transaction; returns rows or {error}.
async function asRole(client, role, claims, sql, params = []) {
  await client.query('BEGIN');
  try {
    if (role) await client.query(`SET LOCAL ROLE ${role}`);
    if (claims) {
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [claims.sub ?? '']);
      await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    }
    const r = await client.query(sql, params);
    await client.query('ROLLBACK');
    return { rows: r.rows, rowCount: r.rowCount };
  } catch (err) {
    await client.query('ROLLBACK');
    return { error: (err.message ?? String(err)).split('\n')[0] };
  }
}

function claimsFor(t) {
  return { sub: t.admin, role: 'authenticated', app_metadata: { company_id: t.company } };
}

async function probeMatrix(client, phase) {
  console.log(`\n=== Isolation probes (${phase}) ===`);
  const a = T.alpha, b = T.bravo;

  // debug: what do the auth helpers see under our claims?
  const dbg = await asRole(client, 'authenticated', claimsFor(a),
    `SELECT auth.uid()::text AS uid, auth.jwt()::text AS jwt, (auth.jwt() -> 'app_metadata' ->> 'company_id') AS cid`);
  console.log('  [debug] auth view:', JSON.stringify(dbg.rows ?? dbg.error));

  // authenticated alpha: companies — sees own, not bravo's
  let r = await asRole(client, 'authenticated', claimsFor(a), `SELECT id FROM public.companies`);
  check(`[auth:alpha] companies visible = {alpha} only`, !r.error && r.rowCount === 1 && r.rows[0].id === a.company, r.error ?? `rows=${r.rowCount}`);

  // authenticated alpha: workers/shift_events of bravo invisible, own visible
  for (const table of ['workers', 'shift_events']) {
    r = await asRole(client, 'authenticated', claimsFor(a), `SELECT count(*)::int AS n FROM public.${table} WHERE company_id = $1`, [b.company]);
    check(`[auth:alpha] ${table} of bravo invisible`, !r.error && r.rows[0].n === 0, r.error ?? `n=${r.rows?.[0]?.n}`);
    r = await asRole(client, 'authenticated', claimsFor(a), `SELECT count(*)::int AS n FROM public.${table} WHERE company_id = $1`, [a.company]);
    check(`[auth:alpha] ${table} of alpha visible`, !r.error && r.rows[0].n >= 1, r.error ?? `n=${r.rows?.[0]?.n}`);
  }

  // symmetric spot-check for bravo
  r = await asRole(client, 'authenticated', claimsFor(b), `SELECT count(*)::int AS n FROM public.workers WHERE company_id = $1`, [a.company]);
  check(`[auth:bravo] workers of alpha invisible`, !r.error && r.rows[0].n === 0, r.error ?? `n=${r.rows?.[0]?.n}`);

  // write probes: cross-tenant INSERT/UPDATE denied for authenticated
  r = await asRole(client, 'authenticated', claimsFor(a),
    `INSERT INTO public.workers (company_id, first_name, last_name, phone, employee_id)
     VALUES ($1, 'Evil', 'Insert', '+61400000999', 'EMP-EVIL-1') RETURNING id`, [b.company]);
  check(`[auth:alpha] INSERT worker into bravo denied`, Boolean(r.error) || r.rowCount === 0, r.error ? '' : `rowCount=${r.rowCount}`);
  r = await asRole(client, 'authenticated', claimsFor(a),
    `UPDATE public.workers SET last_name = 'Pwned' WHERE company_id = $1 RETURNING id`, [b.company]);
  check(`[auth:alpha] UPDATE bravo workers denied/no-op`, Boolean(r.error) || r.rowCount === 0, r.error ? '' : `rowCount=${r.rowCount}`);

  // anon: nothing. Either RLS yields zero rows, or the role has no table
  // grant at all (permission denied) — the stronger condition; prod
  // revokes anon's table privileges, so both count as invisible.
  for (const table of ['companies', 'workers', 'shift_events']) {
    r = await asRole(client, 'anon', { sub: '', role: 'anon' }, `SELECT count(*)::int AS n FROM public.${table}`);
    const invisible = (r.error && /permission denied/i.test(r.error)) || (!r.error && r.rows[0].n === 0);
    check(`[anon] ${table} invisible`, invisible, r.error ?? `n=${r.rows?.[0]?.n}`);
  }

  // service_role: everything (BYPASSRLS prod parity)
  r = await asRole(client, 'service_role', null, `SELECT count(*)::int AS n FROM public.companies`);
  check(`[service_role] sees all companies`, !r.error && r.rows[0].n >= 2, r.error ?? `n=${r.rows?.[0]?.n}`);
}

async function applyForceRls(client) {
  const tables = await client.query(
    `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r' ORDER BY 1`,
  );
  for (const { relname } of tables.rows) {
    await client.query(`ALTER TABLE public."${relname}" FORCE ROW LEVEL SECURITY`);
  }
  const forced = await client.query(
    `SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relforcerowsecurity`,
  );
  check(`[force] relforcerowsecurity = true on all public tables`, forced.rows[0].n === 0, `unforced=${forced.rows[0].n}`);
  return tables.rows.length;
}

async function ownerSemanticsDemo(client) {
  console.log('\n=== Owner semantics demo (informational — prod-impact evidence) ===');
  await client.query(`
    DO $$ BEGIN CREATE ROLE owner_sim NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DROP TABLE IF EXISTS public._force_demo;
    CREATE TABLE public._force_demo (id int, note text);
    INSERT INTO public._force_demo VALUES (1, 'visible?');
    ALTER TABLE public._force_demo OWNER TO owner_sim;
    ALTER TABLE public._force_demo ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA public TO owner_sim;
  `);
  let r = await asRole(client, 'owner_sim', null, `SELECT count(*)::int AS n FROM public._force_demo`);
  console.log(`  ENABLE only — non-superuser OWNER sees ${r.error ?? r.rows[0].n} row(s)  (owner exempt)`);
  await client.query(`ALTER TABLE public._force_demo FORCE ROW LEVEL SECURITY`);
  r = await asRole(client, 'owner_sim', null, `SELECT count(*)::int AS n FROM public._force_demo`);
  console.log(`  FORCE — non-superuser OWNER sees ${r.error ?? r.rows[0].n} row(s)  (owner now subject; no policies → blind)`);
  console.log('  ⇒ On Supabase, `postgres` (non-superuser table owner) would be equally blind:');
  console.log('    SQL editor / MCP execute_sql / DATABASE_URL tooling return 0 rows on every forced table');
  console.log('    unless explicit owner policies are added. service_role (BYPASSRLS) is unaffected.');
  await client.query(`DROP TABLE public._force_demo`);
}

async function main() {
  const client = new pg.Client({ connectionString: PGURL });
  await client.connect();
  try {
    await setupRebuild(client);
    await seedTenants(client);
    await probeMatrix(client, 'pre-FORCE');
    console.log('\n=== FORCE ROW LEVEL SECURITY (all public tables) ===');
    const n = await applyForceRls(client);
    console.log(`  forced ${n} tables`);
    await probeMatrix(client, 'post-FORCE — app roles must be unchanged');
    await ownerSemanticsDemo(client);
    console.log(`\n${failures === 0 ? 'ALL ISOLATION PROBES PASS' : `${failures} PROBE FAILURES`}`);
    process.exit(failures === 0 ? 0 : 1);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
