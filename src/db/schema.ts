import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  date,
  integer,
  decimal,
  jsonb,
  check,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

// Helper: timestamptz equivalent in Drizzle
const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
import { sql } from 'drizzle-orm';

// ── companies ──────────────────────────────────────────────────────────────
//
// 2026-05-02 sync — production columns brought into Drizzle to match the
// onboarding + billing fields added by migrations/202604250930_onboarding_
// company_fields.sql. Friday's audit (Section 2.7) flagged this drift;
// this commit closes it as part of Saturday Shape A foundation.
export const companies = pgTable('companies', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  abn: text('abn'),
  abn_digits: text('abn_digits'),
  contact_email: text('contact_email').notNull(),
  contact_phone: text('contact_phone'),
  created_at: timestamptz('created_at').default(sql`now()`),
  is_active: boolean('is_active').default(true),
  // ── Onboarding wizard substrate (per state-machine.ts) ─────────────
  signup_step: text('signup_step').default('account').notNull(),
  signup_completed_at: timestamptz('signup_completed_at'),
  signing_authority_name: text('signing_authority_name'),
  signing_authority_email: text('signing_authority_email'),
  billing_contact_email: text('billing_contact_email'),
  accepted_terms_at: timestamptz('accepted_terms_at'),
  accepted_terms_version: text('accepted_terms_version'),
  // ── Stripe billing substrate ───────────────────────────────────────
  stripe_customer_id: text('stripe_customer_id'),
  stripe_subscription_id: text('stripe_subscription_id'),
  subscription_status: text('subscription_status'),
  trial_ends_at: timestamptz('trial_ends_at'),
  // ── Pricing tier substrate (per src/lib/stripe/pricing.ts TIERS) ──
  pricing_tier: text('pricing_tier').default('standard').notNull(),
  founding_cohort_position: integer('founding_cohort_position'),
  cancelled_at: timestamptz('cancelled_at'),
});

// ── sites ──────────────────────────────────────────────────────────────────
export const sites = pgTable('sites', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  company_id: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  address: text('address'),
  site_code: text('site_code'),
  geofence_lat: decimal('geofence_lat', { precision: 10, scale: 6 }),
  geofence_lng: decimal('geofence_lng', { precision: 10, scale: 6 }),
  geofence_radius_metres: integer('geofence_radius_metres').default(200),
  is_active: boolean('is_active').default(true),
  created_at: timestamptz('created_at').default(sql`now()`),
});

// ── workers ────────────────────────────────────────────────────────────────
export const workers = pgTable('workers', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  company_id: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  first_name: text('first_name').notNull(),
  last_name: text('last_name').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  employee_id: text('employee_id').notNull(), // REQUIRED for Employment Hero export
  pay_rate: decimal('pay_rate', { precision: 10, scale: 2 }).notNull(), // REQUIRED for earnings display
  award_classification: text('award_classification'),
  is_active: boolean('is_active').default(true),
  created_at: timestamptz('created_at').default(sql`now()`),
  // primary_site_id added 2026-04-22 — see migrations/202604221510_workers_primary_site_id.sql
  primary_site_id: uuid('primary_site_id').references(() => sites.id, { onDelete: 'set null' }),
  // user_id links to auth.uid() — used by worker RLS policies. Present in production
  // but absent from original schema definition (UF-1 drift fix 2026-05-09).
  user_id: uuid('user_id'),
  // myob_card_id set during MYOB payroll export; nullable until first export.
  myob_card_id: text('myob_card_id'),
  // updated_at maintained by application layer on every write.
  updated_at: timestamptz('updated_at')
    .notNull()
    .default(sql`now()`),
  employment_end_date: date('employment_end_date'),
});

// ── supervisors ────────────────────────────────────────────────────────────
export const supervisors = pgTable('supervisors', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  company_id: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  supabase_user_id: uuid('supabase_user_id'),
  site_ids: uuid('site_ids').array(),
  is_active: boolean('is_active').default(true),
  pending_sms_approval_ids: text('pending_sms_approval_ids').array(),
  // Patch 5.4 (CRACK 11/67/98 closure) — Migration 2.0 (6 May 2026)
  // renamed last_batch_sms_date (DATE) to last_batch_sms_sent_at
  // (TIMESTAMPTZ). RULE_011 latency calc now has sub-minute precision.
  last_batch_sms_sent_at: timestamptz('last_batch_sms_sent_at'),
  verify_token: uuid('verify_token').default(sql`gen_random_uuid()`),
  // Added 2026-05-01 by migrations/202605010945_supervisors_add_created_at.sql
  // (applied to production at 1:26pm AEST). Mirrors workers/sites/companies
  // canonical timestamp.
  created_at: timestamptz('created_at')
    .default(sql`now()`)
    .notNull(),
});

// ── shift_events (WLES heart — immutable, no UPDATE, no DELETE) ────────────
export const shift_events = pgTable(
  'shift_events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    company_id: uuid('company_id').references(() => companies.id),
    worker_id: uuid('worker_id').references(() => workers.id),
    site_id: uuid('site_id').references(() => sites.id),
    event_type: text('event_type').notNull(),
    event_data: jsonb('event_data')
      .notNull()
      .default(sql`'{}'::jsonb`),
    device_metadata: jsonb('device_metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),
    gps_lat: decimal('gps_lat', { precision: 10, scale: 6 }),
    gps_lng: decimal('gps_lng', { precision: 10, scale: 6 }),
    gps_accuracy_metres: decimal('gps_accuracy_metres', { precision: 8, scale: 2 }),
    event_hash: text('event_hash').notNull(),
    previous_event_hash: text('previous_event_hash'),
    created_at: timestamptz('created_at').default(sql`now()`),
    created_by: text('created_by').notNull(),
    // Phase 1 dispute-correction workflow (migrations/202605011000):
    //   parent_shift_event_id chains corrective events to the original
    //   event being corrected. correction_reason documents WHY.
    //   NULL for the eight pre-Phase-1 event types; NOT NULL for
    //   CORRECTION / BUG_CORRECTION / SUPERVISOR_RE_APPROVAL.
    parent_shift_event_id: uuid('parent_shift_event_id').references(
      (): AnyPgColumn => shift_events.id,
      { onDelete: 'set null' },
    ),
    correction_reason: text('correction_reason'),
    spec_version: text('spec_version')
      .notNull()
      .default(sql`'0'::text`),
    wles_event: jsonb('wles_event'),
  },
  (table) => [
    check(
      'shift_events_event_type_check',
      // X-FLOSMOSIS-SPEC_VERSION_MIGRATION added by crack_169_companion migration (2026-05-09).
      // WORKER_DISPUTE_FILED added by CRACK 195 (PR #28, 2026-05-10).
      // PAYROLL_APPROVAL added by CRACK 218 (this PR, 2026-05-11) — see
      // migrations/202605110800_crack_218_add_payroll_approval_event_type.sql.
      sql`${table.event_type} IN ('START_EVENT','END_EVENT','SHIFT_COMMIT','SUPERVISOR_APPROVAL','PAYROLL_APPROVAL','INTELLIGENCE_CLEAR','ANOMALY_FLAG','DISPUTE_RAISED','EXPORT_RECORD','CORRECTION','BUG_CORRECTION','SUPERVISOR_RE_APPROVAL','X-FLOSMOSIS-SPEC_VERSION_MIGRATION','WORKER_DISPUTE_FILED')`,
    ),
  ],
);

// ── shifts (aggregated view — updatable) ───────────────────────────────────
export const shifts = pgTable(
  'shifts',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    company_id: uuid('company_id').references(() => companies.id),
    worker_id: uuid('worker_id').references(() => workers.id),
    site_id: uuid('site_id').references(() => sites.id),
    shift_date: date('shift_date').notNull(),
    start_time: timestamptz('start_time').notNull(),
    end_time: timestamptz('end_time'),
    break_minutes: integer('break_minutes').default(0),
    total_hours: decimal('total_hours', { precision: 5, scale: 2 }),
    receipt_id: text('receipt_id').unique().notNull(), // format: FSTR-XXXXXXXX
    status: text('status').notNull().default('IN_PROGRESS'),
    confidence_score: integer('confidence_score').default(50),
    anomaly_flags: jsonb('anomaly_flags').default(sql`'[]'::jsonb`),
    supervisor_approved_by: uuid('supervisor_approved_by'),
    supervisor_approved_at: timestamptz('supervisor_approved_at'),
    payroll_approved_by: uuid('payroll_approved_by'),
    payroll_approved_at: timestamptz('payroll_approved_at'),
    export_id: uuid('export_id'),
    worker_note: text('worker_note'),
    created_at: timestamptz('created_at').default(sql`now()`),
    updated_at: timestamptz('updated_at').default(sql`now()`),
  },
  (table) => [
    check(
      'shifts_status_check',
      // IN_PROGRESS added 2026-04-22 — see migrations/202604221500_shifts_status_in_progress.sql
      sql`${table.status} IN ('IN_PROGRESS','SUBMITTED','SUPERVISOR_APPROVED','PAYROLL_APPROVED','EXPORTED','DISPUTED','ADJUSTED')`,
    ),
  ],
);

// ── exports ────────────────────────────────────────────────────────────────
export const exports = pgTable('exports', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  company_id: uuid('company_id'),
  pay_period_start: date('pay_period_start'),
  pay_period_end: date('pay_period_end'),
  export_target: text('export_target'),
  shift_ids: uuid('shift_ids').array(),
  total_shifts: integer('total_shifts'),
  total_hours: decimal('total_hours'),
  file_hash: text('file_hash'),
  exported_by: uuid('exported_by'),
  exported_at: timestamptz('exported_at'),
  audit_pack_url: text('audit_pack_url'),
});

// ── worker_device_fingerprints ────────────────────────────────────────────
//
// Anti-fraud surface — records every observed worker device fingerprint.
// Fingerprint = SHA-256(UA || Accept-Language || worker_id). The raw UA
// is NOT stored; only its hash. Privacy-preserving identification.
//
// PK is composite (worker_id, fingerprint) — one row per worker-device
// combo. Re-observing an already-known fingerprint touches last_seen_at
// rather than inserting a duplicate row.
//
// See migrations/202604252200_worker_signin_anomaly.sql for full schema + RLS.
export const workerDeviceFingerprints = pgTable('worker_device_fingerprints', {
  worker_id: uuid('worker_id')
    .notNull()
    .references(() => workers.id, { onDelete: 'cascade' }),
  fingerprint: text('fingerprint').notNull(),
  first_seen_at: timestamptz('first_seen_at')
    .default(sql`now()`)
    .notNull(),
  last_seen_at: timestamptz('last_seen_at')
    .default(sql`now()`)
    .notNull(),
  ip_country: text('ip_country'),
  device_label: text('device_label'),
});

// ── worker_sign_in_log ────────────────────────────────────────────────────
//
// Forensic record of every successful worker sign-in. One row per sign-in
// event regardless of whether any flag was raised. Flagged events trigger
// an email to the worker's primary-site supervisor.
//
// See migrations/202604252200_worker_signin_anomaly.sql for full schema + RLS.
export const workerSignInLog = pgTable('worker_sign_in_log', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  worker_id: uuid('worker_id')
    .notNull()
    .references(() => workers.id, { onDelete: 'cascade' }),
  signed_in_at: timestamptz('signed_in_at')
    .default(sql`now()`)
    .notNull(),
  fingerprint: text('fingerprint').notNull(),
  ip_address: text('ip_address'),
  ip_country: text('ip_country'),
  ip_city: text('ip_city'),
  ip_lat: decimal('ip_lat', { precision: 9, scale: 6 }),
  ip_lng: decimal('ip_lng', { precision: 9, scale: 6 }),
  flags: text('flags')
    .array()
    .default(sql`'{}'`)
    .notNull(),
  user_agent: text('user_agent'),
});

// ── Type exports ───────────────────────────────────────────────────────────
export type Company = typeof companies.$inferSelect;
export type Site = typeof sites.$inferSelect;
export type Worker = typeof workers.$inferSelect;
export type Supervisor = typeof supervisors.$inferSelect;
export type ShiftEvent = typeof shift_events.$inferSelect;
export type Shift = typeof shifts.$inferSelect;
export type Export = typeof exports.$inferSelect;

export type NewWorker = typeof workers.$inferInsert;
export type NewSite = typeof sites.$inferInsert;
export type NewSupervisor = typeof supervisors.$inferInsert;
export type NewShift = typeof shifts.$inferInsert;
export type NewShiftEvent = typeof shift_events.$inferInsert;
