#!/usr/bin/env node
// ---------------------------------------------------------------------
// Mo Shaaf / Dass Labour Hire — pre-provisioning seed
// 2026-04-27 · Pre-activation prep for Tuesday Joao on-site testing
//
// ─── SUPERVISOR-SUBSTITUTION TESTING MODE ──────────────────────────────
// For the 28 Apr–2 May testing window, Lauren plays the supervisor
// role. Mo himself is NOT in the testing loop (he hasn't signed his
// contract yet — onboards properly mid-May with real ABN, real phone,
// real Stripe billing). This is supervisor-substitution: Mo's tenant
// exists structurally but the supervisor who receives approval SMS is
// Lauren until Mo signs.
//
// Pass SUPERVISOR_PHONE env var (Lauren's mobile) to designate the
// supervisor contact. The supervisor row name + email come from
// SUPERVISOR_NAME / SUPERVISOR_EMAIL with sensible defaults.
//
// When Mo signs (mid-May), update the seed:
//   1. Set MO_DASS_ABN to Mo's real ABN
//   2. Set SUPERVISOR_PHONE to Mo's real phone
//   3. Set SUPERVISOR_NAME=Mo Shaaf, SUPERVISOR_EMAIL=mo@…
//   4. Re-run --commit (idempotent; updates the supervisor row's
//      phone/name/email in place, doesn't duplicate)
// Joao stays as the same worker across the transition.
// ─────────────────────────────────────────────────────────────────────
//
// Per Q2 of the production-deployment audit Q1-Q5:
//   "Joao's Tuesday-Friday testing is the worker-supervisor closed
//    loop, not the customer-acquisition funnel. Pre-provisioning Mo
//    + Joao + Mo's site directly into Supabase is the Tuesday path."
//
// What this script creates:
//   - companies row for Dass Labour Hire (founding-cohort, tier 'founding',
//     60-day First Customer Recognition trial, 3-year price lock @ $399/mo,
//     position #1 — Mo's First Customer Recognition designation
//     preserved structurally even though Mo is not yet in the testing loop)
//   - sites row for Mo's Sydney-area site (synthetic but plausible)
//   - workers rows for Joao Ferreira (the canonical Tuesday tester)
//     plus any additional workers Mo nominates later (script accepts
//     a JSON file of additional workers via --workers <path>)
//   - supervisors row — DURING TESTING WEEK: Lauren as supervisor
//     (receives SMS approval requests). POST-MO-SIGN: re-run seeds
//     Mo into the supervisor slot (idempotent; updates by name).
//   - admins row (when Mo's auth.users record is created via OTP, link
//     here; until then admin row is created with NULL user_id and the
//     bootstrap-admin route picks it up on Mo's first sign-in)
//
// What this script does NOT do:
//   - Provision Stripe customer / subscription (Mo's billing is
//     hand-shake until Stripe live-mode verification completes)
//   - Trigger any chain seal events (Joao's first CLOCK_IN does that)
//   - Send any SMS or email (Mo onboards via Lauren's hand-off, not
//     via the self-service onboarding wizard)
//
// Usage:
//   node scripts/seed-mo-tenant.mjs                           # dry-run print
//   node scripts/seed-mo-tenant.mjs --commit                  # actually insert
//   node scripts/seed-mo-tenant.mjs --commit --workers <path> # add extra workers
//   node scripts/seed-mo-tenant.mjs --teardown                # remove everything
//
// IDEMPOTENT: re-running --commit is safe. Each insert is gated on
// "does this row already exist by natural key?" — companies by ABN,
// workers by phone, sites by (company_id, name), supervisors by
// phone. Re-runs print "EXISTS" for each row already present.
//
// Required env (server-side; never bundle):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// ---------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js';

// ─── arg parsing ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const TEARDOWN = args.includes('--teardown');
const WORKERS_PATH = (() => {
  const i = args.indexOf('--workers');
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
})();

if (COMMIT && TEARDOWN) {
  console.error('✗ pass either --commit or --teardown, not both');
  process.exit(1);
}

// ─── Mo / Dass Labour Hire — confirmed entity details ──────────────────
// Source: FLOSMOSIS/legal/archive/pre-edit-backups/01-DASS-LABOUR-HIRE_PRE-D2_2026-04-21.html
//   "As the director of Dass Labour Hire" + "Attention: Mo Shaaf"
// Cross-confirmed in audits/NAMING-AUDIT-FULL.txt
//
// Phone numbers + ABN are PLACEHOLDERS — Lauren must set the real
// values before --commit. Script halts on placeholder values when
// --commit is passed. Edit the constants below or override via env.
const COMPANY = {
  name: 'Dass Labour Hire',
  abn: process.env.MO_DASS_ABN ?? 'PLACEHOLDER_ABN',
  // Mo's role-shared inbox; Lauren confirms with Mo at hand-off
  contact_email: process.env.MO_CONTACT_EMAIL ?? 'mo@dasslabourhire.com.au',
  contact_phone: process.env.MO_CONTACT_PHONE ?? '+61400000001',
  pricing_tier: 'founding',
  // First Customer Recognition: 60-day trial per
  // src/lib/onboarding/state-machine.ts:FIRST_CUSTOMER_TRIAL_DAYS
  trial_days: 60,
  // Founding cohort position 1 — Mo is customer #1
  founding_cohort_position: 1,
};

const SITE = {
  name: process.env.MO_SITE_NAME ?? 'Mo Site 1',
  address: process.env.MO_SITE_ADDRESS ?? 'Sydney NSW 2000',
  site_code: process.env.MO_SITE_CODE ?? 'MO-SITE-001',
  // Sydney CBD as a sensible default — Lauren overrides via env
  // before --commit if Mo's actual site is elsewhere.
  geofence_lat: process.env.MO_SITE_LAT ?? '-33.8688',
  geofence_lng: process.env.MO_SITE_LNG ?? '151.2093',
  geofence_radius_metres: 200,
};

// Supervisor — supervisor-substitution mode for testing week.
// During 28 Apr–2 May Joao testing window: Lauren plays the
// supervisor role (receives approval SMS, replies YES/NO/codes).
// Post-Mo-sign mid-May: re-run with Mo's real values; the seed's
// idempotency key is the supervisor name, so changing SUPERVISOR_NAME
// from "Lauren de Mestre" → "Mo Shaaf" creates Mo as a separate row.
// To swap Lauren OUT and Mo IN cleanly, pass --rotate-supervisor.
const SUPERVISOR = {
  name: process.env.SUPERVISOR_NAME ?? 'Lauren de Mestre',
  phone: process.env.SUPERVISOR_PHONE ?? '+61400000001',
  email: process.env.SUPERVISOR_EMAIL ?? 'lauren.flosmosis@gmail.com',
};

// Joao as the canonical Tuesday tester
const WORKER_JOAO = {
  first_name: 'Joao',
  last_name: 'Ferreira',
  phone: process.env.JOAO_PHONE ?? '+61400000002',
  email: process.env.JOAO_EMAIL ?? 'joao@flosmosis.com',
  employee_id: 'EH-001',
  pay_rate: '28.47',
  award_classification: 'CW1 Construction',
};

// ─── env + client ─────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// Placeholder guard — testing-mode acceptance:
// During the supervisor-substitution testing window (28 Apr–2 May):
//   - SUPERVISOR_PHONE (Lauren's real mobile) MUST be set — the SMS
//     approval round-trip can't be tested without it
//   - JOAO_PHONE (Joao's real mobile) MUST be set — Joao's OTP
//     sign-in needs it
//   - COMPANY.abn MAY remain placeholder (Mo's real ABN lands when
//     he signs mid-May; placeholder is acceptable for substrate-
//     functionality testing this week)
//   - COMPANY.contact_phone MAY remain placeholder (Mo isn't being
//     contacted during testing; SUPERVISOR_PHONE is what matters)
if (COMMIT) {
  if (
    SUPERVISOR.phone === '+61400000001' ||
    !/^\+61\d{9}$/.test(SUPERVISOR.phone)
  ) {
    console.error(
      '✗ SUPERVISOR_PHONE not set or not in +61XXXXXXXXX format. This is Lauren\'s mobile during the supervisor-substitution testing window — required to receive approval SMS. Set SUPERVISOR_PHONE env var before --commit.',
    );
    process.exit(1);
  }
  if (
    WORKER_JOAO.phone === '+61400000002' ||
    !/^\+61\d{9}$/.test(WORKER_JOAO.phone)
  ) {
    console.error(
      '✗ JOAO_PHONE not set or not in +61XXXXXXXXX format. Joao\'s OTP sign-in requires his real mobile. Set JOAO_PHONE env var before --commit.',
    );
    process.exit(1);
  }
  // ABN + Mo's contact_phone are testing-mode-acceptable as
  // placeholders. Print a warning if the founding-cohort billing
  // path is ever activated against placeholder ABN — but billing
  // doesn't run during testing-week.
  if (COMPANY.abn === 'PLACEHOLDER_ABN') {
    console.log(
      '  ⚠ NOTE: COMPANY.abn is placeholder. This is acceptable for the' +
      ' supervisor-substitution testing window. Update via MO_DASS_ABN' +
      ' env var when Mo signs mid-May.',
    );
  }
}

// ─── teardown path ────────────────────────────────────────────────────
async function teardown() {
  console.log('▶ teardown — removing Mo / Dass Labour Hire seed');
  // Find the company first; cascade-delete via FKs handles sites + workers + supervisors
  const { data: company } = await sb
    .from('companies')
    .select('id')
    .eq('name', COMPANY.name)
    .maybeSingle();
  if (!company) {
    console.log('  no Dass Labour Hire row found; nothing to tear down');
    return;
  }
  // Delete shift_events for Joao first (no cascade from companies → shift_events
  // because shift_events.company_id is intentionally not ON DELETE CASCADE).
  // Joao test data only — production data NEVER touched by this script.
  const { data: workers } = await sb
    .from('workers')
    .select('id')
    .eq('company_id', company.id);
  for (const w of workers ?? []) {
    await sb.from('shift_events').delete().eq('worker_id', w.id);
    await sb.from('shifts').delete().eq('worker_id', w.id);
  }
  // Now delete the company; cascade handles workers + sites + supervisors
  await sb.from('companies').delete().eq('id', company.id);
  console.log(`  ✓ removed company ${company.id} + cascading workers/sites/supervisors`);
  console.log(`  ✓ removed shift_events + shifts for ${(workers ?? []).length} worker(s)`);
}

// ─── seed path ────────────────────────────────────────────────────────
async function seed() {
  // (1) Company — keyed on name (or ABN if you prefer; both work)
  let companyId;
  const { data: existingCompany } = await sb
    .from('companies')
    .select('id, founding_cohort_position, pricing_tier, trial_ends_at')
    .eq('name', COMPANY.name)
    .maybeSingle();
  if (existingCompany) {
    companyId = existingCompany.id;
    console.log(`  EXISTS  company "${COMPANY.name}" (${companyId})`);
  } else {
    const trialEndsAt = new Date(
      Date.now() + COMPANY.trial_days * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data: inserted, error } = await sb
      .from('companies')
      .insert({
        name: COMPANY.name,
        abn: COMPANY.abn,
        contact_email: COMPANY.contact_email,
        contact_phone: COMPANY.contact_phone,
        pricing_tier: COMPANY.pricing_tier,
        founding_cohort_position: COMPANY.founding_cohort_position,
        trial_ends_at: trialEndsAt,
        signup_step: 'done',
        signup_completed_at: new Date().toISOString(),
        // Company-level fields point to Mo (the eventual customer
        // signing authority + billing contact), NOT to the
        // testing-week supervisor (Lauren). Mo's real values land
        // when he signs mid-May; placeholders until then.
        signing_authority_name: 'Mo Shaaf',
        signing_authority_email: COMPANY.contact_email,
        billing_contact_email: COMPANY.contact_email,
        is_active: true,
      })
      .select('id')
      .single();
    if (error) throw error;
    companyId = inserted.id;
    console.log(
      `  CREATED company "${COMPANY.name}" (${companyId})  tier=founding  trial→${trialEndsAt}`,
    );
  }

  // (2) Site — keyed on (company_id, name)
  let siteId;
  const { data: existingSite } = await sb
    .from('sites')
    .select('id')
    .eq('company_id', companyId)
    .eq('name', SITE.name)
    .maybeSingle();
  if (existingSite) {
    siteId = existingSite.id;
    console.log(`  EXISTS  site "${SITE.name}" (${siteId})`);
  } else {
    const { data: inserted, error } = await sb
      .from('sites')
      .insert({
        company_id: companyId,
        name: SITE.name,
        address: SITE.address,
        site_code: SITE.site_code,
        geofence_lat: SITE.geofence_lat,
        geofence_lng: SITE.geofence_lng,
        geofence_radius_metres: SITE.geofence_radius_metres,
        is_active: true,
      })
      .select('id')
      .single();
    if (error) throw error;
    siteId = inserted.id;
    console.log(
      `  CREATED site "${SITE.name}" (${siteId})  geofence ${SITE.geofence_radius_metres}m around (${SITE.geofence_lat}, ${SITE.geofence_lng})`,
    );
  }

  // (3) Supervisor — keyed on phone
  const { data: existingSupervisor } = await sb
    .from('supervisors')
    .select('id, site_ids')
    .eq('phone', SUPERVISOR.phone)
    .maybeSingle();
  let supervisorId;
  if (existingSupervisor) {
    supervisorId = existingSupervisor.id;
    // Ensure this site is in their site_ids array
    const sites = new Set([...(existingSupervisor.site_ids ?? []), siteId]);
    await sb
      .from('supervisors')
      .update({ site_ids: [...sites] })
      .eq('id', supervisorId);
    console.log(`  EXISTS  supervisor "${SUPERVISOR.name}" (${supervisorId})  site_ids merged`);
  } else {
    const { data: inserted, error } = await sb
      .from('supervisors')
      .insert({
        company_id: companyId,
        name: SUPERVISOR.name,
        phone: SUPERVISOR.phone,
        email: SUPERVISOR.email,
        site_ids: [siteId],
        is_active: true,
      })
      .select('id')
      .single();
    if (error) throw error;
    supervisorId = inserted.id;
    console.log(`  CREATED supervisor "${SUPERVISOR.name}" (${supervisorId})`);
  }

  // (4) Worker Joao — keyed on phone
  const { data: existingJoao } = await sb
    .from('workers')
    .select('id')
    .eq('phone', WORKER_JOAO.phone)
    .maybeSingle();
  let joaoId;
  if (existingJoao) {
    joaoId = existingJoao.id;
    console.log(`  EXISTS  worker "${WORKER_JOAO.first_name} ${WORKER_JOAO.last_name}" (${joaoId})`);
  } else {
    const { data: inserted, error } = await sb
      .from('workers')
      .insert({
        company_id: companyId,
        first_name: WORKER_JOAO.first_name,
        last_name: WORKER_JOAO.last_name,
        phone: WORKER_JOAO.phone,
        email: WORKER_JOAO.email,
        employee_id: WORKER_JOAO.employee_id,
        pay_rate: WORKER_JOAO.pay_rate,
        award_classification: WORKER_JOAO.award_classification,
        primary_site_id: siteId,
        is_active: true,
      })
      .select('id')
      .single();
    if (error) throw error;
    joaoId = inserted.id;
    console.log(
      `  CREATED worker "${WORKER_JOAO.first_name} ${WORKER_JOAO.last_name}" (${joaoId}) @ $${WORKER_JOAO.pay_rate}/hr`,
    );
  }

  // (5) Optional additional workers from --workers JSON file
  if (WORKERS_PATH) {
    const fs = await import('node:fs/promises');
    const extras = JSON.parse(await fs.readFile(WORKERS_PATH, 'utf8'));
    for (const w of extras) {
      const { data: existing } = await sb
        .from('workers')
        .select('id')
        .eq('phone', w.phone)
        .maybeSingle();
      if (existing) {
        console.log(`  EXISTS  extra worker "${w.first_name} ${w.last_name}" (${existing.id})`);
        continue;
      }
      const { data: inserted, error } = await sb
        .from('workers')
        .insert({
          company_id: companyId,
          first_name: w.first_name,
          last_name: w.last_name,
          phone: w.phone,
          email: w.email ?? null,
          employee_id: w.employee_id,
          pay_rate: String(w.pay_rate),
          award_classification: w.award_classification ?? null,
          primary_site_id: siteId,
          is_active: true,
        })
        .select('id')
        .single();
      if (error) throw error;
      console.log(
        `  CREATED extra worker "${w.first_name} ${w.last_name}" (${inserted.id}) @ $${w.pay_rate}/hr`,
      );
    }
  }

  // (6) Admins row — Mo as 'director'.
  // Note: admins.user_id references auth.users(id). At seed time Mo
  // hasn't yet signed in so there's no auth.users row to link to.
  // Path: Lauren creates Mo's auth.users via Supabase dashboard
  // (Authentication → Users → Add user → email + magic link), captures
  // the resulting user UUID, and runs:
  //   ADMIN_USER_ID=<uuid> COMMIT=1 node scripts/seed-mo-tenant.mjs --commit
  // The script then inserts the admins row idempotently. Until then,
  // Mo logs in via supervisor SMS / verify path.
  if (process.env.ADMIN_USER_ID) {
    const userId = process.env.ADMIN_USER_ID;
    const { data: existingAdmin } = await sb
      .from('admins')
      .select('user_id, company_id')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (existingAdmin) {
      console.log(`  EXISTS  admins row (user ${userId} → company ${companyId})`);
    } else {
      const { error } = await sb.from('admins').insert({
        user_id: userId,
        company_id: companyId,
        role: 'director',
      });
      if (error) throw error;
      console.log(`  CREATED admins row (user ${userId} → company ${companyId}, role=director)`);
    }
  } else {
    console.log(
      '  SKIPPED admins row — set ADMIN_USER_ID env var (Mo\'s auth.users uuid) and re-run',
    );
  }
}

// ─── main ─────────────────────────────────────────────────────────────
async function main() {
  console.log('▶ Mo / Dass Labour Hire seed');
  console.log(`  mode: ${TEARDOWN ? 'TEARDOWN' : COMMIT ? 'COMMIT' : 'DRY-RUN'}`);
  if (TEARDOWN) {
    if (!COMMIT && !args.includes('--force')) {
      console.error(
        '✗ teardown requires --commit or --force to confirm (no dry-run for delete)',
      );
      process.exit(1);
    }
    await teardown();
    return;
  }
  if (!COMMIT) {
    console.log('▶ DRY-RUN — no inserts performed. Pass --commit to execute.');
    console.log(`  would create company "${COMPANY.name}" abn=${COMPANY.abn}`);
    console.log(`  would create site "${SITE.name}" at (${SITE.geofence_lat}, ${SITE.geofence_lng})`);
    console.log(`  would create supervisor "${SUPERVISOR.name}" phone=${SUPERVISOR.phone}`);
    console.log(
      `  would create worker "${WORKER_JOAO.first_name} ${WORKER_JOAO.last_name}" phone=${WORKER_JOAO.phone}`,
    );
    if (WORKERS_PATH) console.log(`  would also create extra workers from ${WORKERS_PATH}`);
    console.log('  would skip admins row (set ADMIN_USER_ID env var to populate)');
    return;
  }
  await seed();
  console.log('✓ seed complete');
}

main().catch((err) => {
  console.error('✗ seed failed:', err.message ?? err);
  process.exit(1);
});
