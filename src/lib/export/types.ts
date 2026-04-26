// Flostruction Export — Core Types
// Provider-agnostic types for the export pipeline.
// Adding a new payroll provider means implementing ExportFormatter — nothing else.

// ─── ApprovedShift ──────────────────────────────────────────────────────────
// The canonical shape of a shift ready for export.
// Fetched by getApprovedShifts(), consumed by all ExportFormatter implementations.

export interface ApprovedShift {
  id: string;
  worker_id: string;
  worker_employee_id: string;   // External payroll system employee ID
  worker_first_name: string;
  worker_last_name: string;
  site_id: string;
  site_name: string;
  company_id: string;
  shift_date: string;           // YYYY-MM-DD
  start_time: string;           // ISO 8601 timestamptz
  end_time: string;             // ISO 8601 timestamptz
  break_minutes: number;
  total_hours: number;          // decimal(10,2) as number
  pay_rate: number;             // decimal(10,2) — dollars, NOT cents
  status: 'PAYROLL_APPROVED';   // Only payroll-approved shifts reach export
  receipt_id: string;           // FSTR-XXXXXXXX
  notes: string;
}

// ─── ExportFormatter ────────────────────────────────────────────────────────
// The contract every payroll provider formatter must implement.
// Phase 2 providers (Xero, MYOB, Micropay) each implement this interface.

export interface ExportFormatter {
  /** Unique provider identifier — stored in exports.export_target */
  readonly providerId: string;

  /** Human-readable provider name for UI display */
  readonly providerName: string;

  /** File extension for the export (e.g. 'csv', 'xml') */
  readonly fileExtension: string;

  /** MIME type for the download response */
  readonly mimeType: string;

  /**
   * Validate shifts before formatting. Returns an array of errors.
   * An empty array means all shifts are valid for this provider.
   */
  validate(shifts: ApprovedShift[]): ValidationError[];

  /**
   * Format approved shifts into the provider's import format.
   * Returns the raw file content as a string.
   */
  format(shifts: ApprovedShift[]): string;
}

// ─── ValidationError ────────────────────────────────────────────────────────

export interface ValidationError {
  shiftId: string;
  field: string;
  message: string;
}

// ─── ExportResult ───────────────────────────────────────────────────────────
// Returned by the export pipeline after formatting + WLES event creation.

export interface ExportResult {
  success: boolean;
  exportId: string;
  providerId: string;
  fileName: string;
  content: string;
  shiftCount: number;
  totalHours: number;
  errors: ValidationError[];
}
