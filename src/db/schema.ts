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
} from 'drizzle-orm/pg-core';

// Helper: timestamptz equivalent in Drizzle
const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
import { sql } from 'drizzle-orm';

// ── companies ──────────────────────────────────────────────────────────────
export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  abn: text('abn'),
  contact_email: text('contact_email').notNull(),
  contact_phone: text('contact_phone'),
  created_at: timestamptz('created_at').default(sql`now()`),
  is_active: boolean('is_active').default(true),
});

// ── sites ──────────────────────────────────────────────────────────────────
export const sites = pgTable('sites', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
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
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
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
});

// ── supervisors ────────────────────────────────────────────────────────────
export const supervisors = pgTable('supervisors', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  company_id: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  supabase_user_id: uuid('supabase_user_id'),
  site_ids: uuid('site_ids').array(),
  is_active: boolean('is_active').default(true),
  pending_sms_approval_ids: text('pending_sms_approval_ids').array(),
  last_batch_sms_date: date('last_batch_sms_date'),
  verify_token: uuid('verify_token').default(sql`gen_random_uuid()`),
});

// ── shift_events (WLES heart — immutable, no UPDATE, no DELETE) ────────────
export const shift_events = pgTable(
  'shift_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    company_id: uuid('company_id').references(() => companies.id),
    worker_id: uuid('worker_id').references(() => workers.id),
    site_id: uuid('site_id').references(() => sites.id),
    event_type: text('event_type').notNull(),
    event_data: jsonb('event_data').notNull().default(sql`'{}'::jsonb`),
    device_metadata: jsonb('device_metadata').notNull().default(sql`'{}'::jsonb`),
    gps_lat: decimal('gps_lat', { precision: 10, scale: 6 }),
    gps_lng: decimal('gps_lng', { precision: 10, scale: 6 }),
    gps_accuracy_metres: decimal('gps_accuracy_metres', { precision: 8, scale: 2 }),
    event_hash: text('event_hash').notNull(),
    previous_event_hash: text('previous_event_hash'),
    created_at: timestamptz('created_at').default(sql`now()`),
    created_by: text('created_by').notNull(),
  },
  (table) => [
    check(
      'shift_events_event_type_check',
      sql`${table.event_type} IN ('START_EVENT','END_EVENT','SHIFT_COMMIT','SUPERVISOR_APPROVAL','INTELLIGENCE_CLEAR','ANOMALY_FLAG','DISPUTE_RAISED','EXPORT_RECORD')`
    ),
  ]
);

// ── shifts (aggregated view — updatable) ───────────────────────────────────
export const shifts = pgTable(
  'shifts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    company_id: uuid('company_id').references(() => companies.id),
    worker_id: uuid('worker_id').references(() => workers.id),
    site_id: uuid('site_id').references(() => sites.id),
    shift_date: date('shift_date').notNull(),
    start_time: timestamptz('start_time').notNull(),
    end_time: timestamptz('end_time'),
    break_minutes: integer('break_minutes').default(0),
    total_hours: decimal('total_hours', { precision: 5, scale: 2 }),
    receipt_id: text('receipt_id').unique().notNull(), // format: FSTR-XXXXXXXX
    status: text('status').notNull().default('SUBMITTED'),
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
      sql`${table.status} IN ('IN_PROGRESS','SUBMITTED','SUPERVISOR_APPROVED','PAYROLL_APPROVED','EXPORTED','DISPUTED','ADJUSTED')`
    ),
  ]
);

// ── exports ────────────────────────────────────────────────────────────────
export const exports = pgTable('exports', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
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
