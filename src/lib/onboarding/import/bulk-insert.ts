// bulkInsertWorkers — atomic bulk worker insert.
//
// Shape B v1 substrate. Inserts a batch of WorkerImportRows into the
// `workers` table in a single PostgreSQL INSERT statement. Postgres
// guarantees atomicity at the statement level: if any row violates a
// constraint (unique employee_id, FK to companies, etc.), the entire
// batch fails and no rows are committed.
//
// Hard-rule compliance:
//   - Tenant isolation: every row's company_id must equal the
//     `company_id` parameter. Caller-side guard surfaces tenant
//     mismatches as a thrown error rather than letting them slip into
//     the DB.
//   - No floating-point money: pay_rate is passed through as a
//     decimal-formatted string, matching the workers.pay_rate
//     decimal(10,2) column.
//   - Phone canonical form: every row's phone is expected to already be
//     in +61XXXXXXXXX form (parser layer enforced via
//     phoneNormaliser.toCanonical). bulkInsertWorkers does NOT
//     re-normalise — re-normalisation would mask data-flow bugs.
//   - Pre-insert duplicate detection: duplicate employee_ids within the
//     same batch are flagged before INSERT to give clearer error
//     messages than PG's unique-violation error text.

import type { WorkerImportRow, BulkImportResult } from './types';

/**
 * Minimal Supabase client interface used by bulkInsertWorkers.
 * Decoupled from the live `@supabase/supabase-js` client so tests can
 * pass a fake without the full SDK surface.
 */
export interface SupabaseLike {
  from: (table: string) => {
    insert: (rows: unknown[]) => {
      select: (cols: string) => Promise<{
        data: { id: string }[] | null;
        error: { message: string } | null;
      }>;
    };
  };
}

/**
 * Bulk-insert workers atomically.
 *
 * Returns BulkImportResult.ok=true with inserted_ids on success.
 * Returns ok=false with an error message on failure.
 *
 * Throws (does NOT silently filter) on:
 *   - any row whose company_id doesn't equal the company_id parameter
 *     (tenant-isolation invariant)
 *   - duplicate employee_id within the input rows
 *   - any row with non-canonical phone format (defensive double-check)
 */
export async function bulkInsertWorkers(
  rows: WorkerImportRow[],
  company_id: string,
  client: SupabaseLike,
): Promise<BulkImportResult> {
  if (rows.length === 0) {
    return { ok: true, inserted_count: 0, inserted_ids: [] };
  }

  // Tenant-isolation invariant
  for (const row of rows) {
    if (row.company_id !== company_id) {
      throw new Error(
        `bulkInsertWorkers: tenant mismatch — row source_row=${row.source_row} ` +
          `has company_id=${row.company_id} but caller specified ${company_id}`,
      );
    }
  }

  // Pre-insert duplicate detection on employee_id
  const seenEmployeeIds = new Map<string, number>();
  for (const row of rows) {
    const prior = seenEmployeeIds.get(row.employee_id);
    if (prior !== undefined) {
      throw new Error(
        `bulkInsertWorkers: duplicate employee_id "${row.employee_id}" in input ` +
          `at source_row=${row.source_row} (first seen at source_row=${prior})`,
      );
    }
    seenEmployeeIds.set(row.employee_id, row.source_row);
  }

  // Defensive phone-format double-check — every row must already be in
  // canonical +61XXXXXXXXX form per parser-layer normalisation.
  for (const row of rows) {
    if (!/^\+61\d{9}$/.test(row.phone)) {
      throw new Error(
        `bulkInsertWorkers: non-canonical phone "${row.phone}" at source_row=${row.source_row} — ` +
          `parser layer should have normalised via phoneNormaliser.toCanonical()`,
      );
    }
  }

  // Strip source_row before insert — it's a parse-time-only field.
  const insertable = rows.map(({ source_row: _ignored, ...rest }) => rest);

  const { data, error } = await client
    .from('workers')
    .insert(insertable)
    .select('id');

  if (error) {
    return {
      ok: false,
      inserted_count: 0,
      inserted_ids: [],
      error: error.message,
    };
  }

  const ids = (data ?? []).map((r) => r.id);
  return {
    ok: true,
    inserted_count: ids.length,
    inserted_ids: ids,
  };
}
