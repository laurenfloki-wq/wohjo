// WLES v1.0 — type definitions.
//
// Every field name here matches the spec's Section 4 exactly
// (wles.io/spec/v1.0 — `FLOSMOSIS/standards/WLES-v1.0-Specification.md`).
// Deviations from these names break cross-implementation verification.
//
// Source-of-truth: WLES v1.0 Section 4.

/**
 * A lowercase-hexadecimal SHA-256 string of exactly 64 characters.
 * Spec §4.3, §4.4.
 */
export type Sha256Hex = string;

/**
 * The WLES zero hash — previous_event_hash for the first event in
 * any chain. Spec §4.4.
 */
export const ZERO_HASH: Sha256Hex =
  '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * WLES v1.0 committed event types per Section 7. Substrate-review
 * type-registry lock (2026-06-06) added seven FLOSTRUCTION-derived
 * lifecycle types as committed §7 entries: CORRECTION,
 * BUG_CORRECTION, DISPUTE_RAISED, WORKER_DISPUTE_FILED,
 * EXPORT_RECORD, PAYROLL_APPROVAL, WORKER_CREATED. Supervisor
 * approval is NOT a standalone committed type — web-link and SMS
 * approvals both flow through §7.6 APPROVAL with a `channel`
 * attribute (sms | web_link).
 *
 * Extension event types use the `X-<namespace>-<name>` pattern per
 * Section 9.1 — reserved for protocol/meta events that the spec
 * intentionally does not standardise (SPEC_VERSION_MIGRATION,
 * SPEC_VERSION_ANOMALY).
 */
export const WLES_EVENT_TYPES = [
  // Original §7 committed types
  'SHIFT_COMMIT',
  'CLOCK_IN',
  'CLOCK_OUT',
  'BREAK_START',
  'BREAK_END',
  'APPROVAL',
  'INTELLIGENCE_CLEAR',
  'ANOMALY_FLAG',
  // Type-registry lock 2026-06-06 — FLOSTRUCTION lifecycle committed types
  'CORRECTION',
  'BUG_CORRECTION',
  'DISPUTE_RAISED',
  'WORKER_DISPUTE_FILED',
  'EXPORT_RECORD',
  'PAYROLL_APPROVAL',
  'WORKER_CREATED',
] as const;

export type WlesEventType = (typeof WLES_EVENT_TYPES)[number];

/**
 * An event_type is valid if it is one of the eight committed
 * types OR starts with `X-<namespace>-<name>` per Section 9.1.
 */
export function isValidEventType(t: string): boolean {
  return (WLES_EVENT_TYPES as readonly string[]).includes(t) || /^X-[A-Z0-9_]+-[A-Z0-9_]+/i.test(t);
}

/**
 * Section 4.9 metadata — optional, not normatively specified.
 * Additional fields are permitted; those starting with `x-` per
 * Section 9.2 are extension fields.
 */
export interface WlesMetadata {
  device_id?: string;
  ip_address?: string;
  geolocation?: {
    latitude?: number;
    longitude?: number;
    accuracy?: number;
  };
  user_agent?: string;
  app_version?: string;
  // arbitrary `x-`-prefixed keys permitted
  [key: string]: unknown;
}

// Per Section 7 event type payload schemas.

export interface ShiftCommitPayload {
  shift_id: string;
  site_id: string;
  scheduled_start?: string;
  scheduled_end?: string;
}

export interface ClockInPayload {
  shift_id: string;
  site_id: string;
  detection_method: 'geofence' | 'manual' | 'qr_code' | 'supervisor' | 'other';
  geofence_detected_at?: string;
}

export interface ClockOutPayload {
  shift_id: string;
  site_id: string;
  worker_confirmed_start_at?: string;
  start_time_source?: 'geofence' | 'worker_confirmed' | 'supervisor_adjusted';
}

export interface BreakStartPayload {
  shift_id: string;
  break_type?: 'meal' | 'rest' | 'other';
}

export interface BreakEndPayload {
  shift_id: string;
  break_start_event_id?: string;
}

export interface ApprovalPayload {
  shift_id: string;
  approved_hours: number; // per §7.6: decimal number to two decimal places
  /**
   * Type-registry lock 2026-06-06: APPROVAL is the §7.6 committed
   * type for ALL supervisor approvals. `channel` distinguishes the
   * delivery medium. SMS approval (Twilio webhook) and web-link
   * approval (verify token) both use APPROVAL with channel set
   * accordingly — no standalone SUPERVISOR_APPROVAL standard type.
   */
  channel: 'sms' | 'web_link';
  /** Optional FLOSTRUCTION extension: actor id of the approving supervisor. */
  supervisor_id?: string;
}

/**
 * FLOSTRUCTION-specific PAYROLL_APPROVAL event (CRACK 218).
 *
 * Not a WLES v1.0 spec event type — payroll-level approval is a
 * FLOSTRUCTION business concept distinct from §7.6 APPROVAL (which is
 * the worker-supervisor pairing). This type ships under spec_version='0'
 * via the v0 sealing path; if/when the WLES v1.0 path is enabled for
 * this event, it must be emitted as the X-FLOSMOSIS-PAYROLL_APPROVAL
 * extension event type per §9.1.
 *
 * Schema rationale per the 2026-05-11 dispatch:
 *   - `shift_id`: which shift is being payroll-approved.
 *   - `receipt_id`: cached FSTR-XXXXXXXX receipt for audit-trail UI.
 *   - `approved_by_user_id`: the admin's auth.users UUID. NEVER the
 *     hardcoded 'payroll-admin' string — that bug is exactly what
 *     CRACK 218 fixes.
 *   - `approved_at`: ISO 8601 UTC ms timestamp of the approval.
 *
 * No `layer` field — the legacy SUPERVISOR_APPROVAL hack used layer='FINAL'
 * to disambiguate; PAYROLL_APPROVAL is a distinct event_type so the layer
 * tag is no longer needed.
 */
export interface PayrollApprovalPayload {
  shift_id: string;
  receipt_id: string;
  approved_by_user_id: string;
  approved_at: string;
}

export interface IntelligenceClearPayload {
  shift_id: string;
  checks_performed: string[];
  check_version: string;
}

export interface AnomalyFlagPayload {
  shift_id: string;
  anomaly_type: string;
  severity: 'low' | 'medium' | 'high';
  details?: string;
}

/**
 * §7 — FLOSTRUCTION committed type payloads (locked 2026-06-06).
 * Shape mirrors the v0 event_data conventions so audit-trail UI and
 * cron readers don't need a schema flip; the WLES seal+verifier
 * treat these as fully standardised committed types.
 *
 * PayrollApprovalPayload is already declared above — it stays as
 * the canonical PAYROLL_APPROVAL payload shape (the prior comment
 * noted it as FLOSTRUCTION-specific; under the type-registry lock
 * it is now a §7 committed type).
 */

export interface CorrectionPayload {
  shift_id: string;
  correction_reason: string;
  changes: Record<string, unknown>;
  parent_shift_event_id?: string;
}

export interface BugCorrectionPayload {
  shift_id: string;
  correction_reason: string;
  defect_reference: string;
  changes: Record<string, unknown>;
  parent_shift_event_id?: string;
}

export interface DisputeRaisedPayload {
  shift_id: string;
  reason: string;
  source?: 'web_verify' | 'sms' | 'command_admin' | 'worker_app';
}

export interface WorkerDisputeFiledPayload {
  dispute_id: string;
  dispute_type: string;
  related_shift_id?: string;
}

export interface ExportRecordPayload {
  shift_id: string;
  export_id: string;
  provider: string;
  file_hash: string;
}

export interface WorkerCreatedPayload {
  worker_id: string;
  employee_id: string;
  employee_name: string;
  phone_e164: string;
  myob_card_id?: string | null;
  created_via: 'bulk_upload' | 'single_form' | 'api';
}

/**
 * Extension payloads are arbitrary objects. Extension-defined
 * fields MUST be `x-` prefixed per Section 9.2.
 */
export interface ExtensionPayload {
  [key: string]: unknown;
}

/**
 * A WLES v1.0 event per Section 4. Every required field is
 * populated; `metadata` is optional.
 */
export interface WlesEvent {
  event_id: string;
  event_type: string;
  event_hash: Sha256Hex;
  previous_event_hash: Sha256Hex;
  actor_id: string;
  subject_id: string;
  /** ISO 8601 UTC, millisecond precision, trailing Z. Spec §4.7. */
  timestamp: string;
  payload: Record<string, unknown>;
  metadata?: WlesMetadata;
}

/**
 * Convenience — a WLES event whose event_hash has not been
 * populated yet. Used as input to `hashEvent()`.
 */
export type WlesEventUnsealed = Omit<WlesEvent, 'event_hash'>;
