// Flostruction Audit — Core Types
// Types for the audit pack generator.

import type { WlesEvent } from '@/lib/wles/v1-types';

export interface AuditShiftEvent {
  id: string;
  company_id: string;
  worker_id: string;
  site_id: string;
  event_type: string;
  event_data: Record<string, unknown>;
  device_metadata: Record<string, unknown>;
  event_hash: string;
  previous_event_hash: string | null;
  created_at: string;
  created_by: string;
  // WLES spec version + canonical sealed event. Present on v1.0-sealed
  // events; their hash is verified under WLES v1.0 §8.1, not the v0
  // recompute. The substrate event_type column is the bare canonical
  // name (e.g. EXPORT_RECORD) while wles_event carries the spec type
  // (e.g. X-FLOSMOSIS-EXPORT_RECORD) it was actually hashed under.
  spec_version?: string | null;
  wles_event?: WlesEvent | null;
}

export interface AuditShiftSummary {
  shift_id: string;
  worker_name: string;
  worker_employee_id: string;
  site_name: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  total_hours: number;
  status: string;
  receipt_id: string;
  events: AuditShiftEvent[];
  hash_chain_valid: boolean;
}

export interface AuditPack {
  generated_at: string;
  company_id: string;
  period_start: string;
  period_end: string;
  total_shifts: number;
  total_events: number;
  total_hours: number;
  hash_chain_integrity: 'VERIFIED' | 'BROKEN';
  broken_chains: string[]; // shift IDs with broken hash chains
  shifts: AuditShiftSummary[];
}
