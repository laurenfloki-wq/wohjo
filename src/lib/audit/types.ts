// Flostruction Audit — Core Types
// Types for the audit pack generator.

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
  broken_chains: string[];  // shift IDs with broken hash chains
  shifts: AuditShiftSummary[];
}
