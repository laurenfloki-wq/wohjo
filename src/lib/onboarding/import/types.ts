// Bulk worker import — shared types
//
// Shape B v1: data-layer-only substrate for importing workers from
// the five mainstream Australian payroll provider CSV exports.
// No UI in this commit. UI lands in Shape B v2.
//
// Hard rules:
//   - Tenant isolation: every imported row carries the company_id
//     parameter passed to the parser/bulk-insert; never inferred from
//     the CSV.
//   - Phone normalisation: all phones routed through
//     phoneNormaliser.toCanonical() (commit 8277f65) at parse time so
//     downstream substrate sees only the canonical +61XXXXXXXXX form.
//   - Pay rate: parsed as decimal-formatted string with 2dp precision,
//     matching the workers.pay_rate decimal(10,2) column.
//   - Atomicity: bulkInsertWorkers is all-or-nothing. Any single
//     row failure aborts the entire batch.

/**
 * Canonical worker row produced by every provider parser.
 * Maps directly to the `workers` table per src/db/schema.ts.
 */
export interface WorkerImportRow {
  /** Tenant scope — set by caller, never from CSV */
  company_id: string;
  /** Provider-source row index (1-based, includes header offset) for error reporting */
  source_row: number;
  /** First name — required */
  first_name: string;
  /** Last name — required */
  last_name: string;
  /** Phone in canonical +61XXXXXXXXX form per phoneNormaliser */
  phone: string;
  /** Email — optional */
  email: string | null;
  /** Provider-side employee identifier — required for Employment Hero export */
  employee_id: string;
  /** Pay rate as decimal-formatted string ('28.47' not 28.47) */
  pay_rate: string;
  /** Award classification — optional */
  award_classification: string | null;
}

/**
 * A row-level parse error with enough context to surface to the user
 * which row in their CSV failed and why.
 */
export interface WorkerImportError {
  /** Which row in the source CSV (1-based, header at row 1) */
  source_row: number;
  /** Which field failed parsing — null if the whole row was malformed */
  field: keyof WorkerImportRow | 'row' | null;
  /** Human-readable error message */
  message: string;
  /** Provider-side raw value that triggered the error, if applicable */
  raw_value?: string;
}

/**
 * Outcome of a parse pass — either fully clean rows ready for bulk
 * insert, or a list of per-row errors. The caller decides whether to
 * proceed with the clean rows (skipping bad ones) or abort the batch.
 */
export interface ParseResult {
  rows: WorkerImportRow[];
  errors: WorkerImportError[];
}

/**
 * Outcome of bulkInsertWorkers. On success, inserted_count equals
 * the input row count and inserted_ids contains every new worker row
 * id. On failure, the operation rolled back and inserted_count is 0.
 */
export interface BulkImportResult {
  ok: boolean;
  inserted_count: number;
  inserted_ids: string[];
  /** Postgres error if the batch failed */
  error?: string;
}

/** The five providers Shape B v1 supports. */
export type Provider = 'xero' | 'myob' | 'employment-hero' | 'keypay' | 'micropay';
