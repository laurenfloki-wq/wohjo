// bulkInsertWorkers tests.
//
// Coverage:
//   - empty-batch fast-path
//   - tenant-isolation invariant (mismatched company_id throws)
//   - duplicate employee_id detection (throws with both source_rows)
//   - non-canonical phone defensive guard (throws)
//   - happy-path single-row insert
//   - happy-path multi-row insert with id collection
//   - DB error returns ok: false with error message (no throw)
//   - source_row stripped from inserted payload

import { describe, it, expect, vi } from 'vitest';
import { bulkInsertWorkers, type SupabaseLike } from './bulk-insert';
import type { WorkerImportRow } from './types';

const COMPANY_ID = '00000000-1000-0000-0000-000000000001';

function makeRow(overrides: Partial<WorkerImportRow> = {}): WorkerImportRow {
  return {
    company_id: COMPANY_ID,
    source_row: 2,
    first_name: 'Joao',
    last_name: 'Muniz',
    phone: '+61413573579',
    email: null,
    employee_id: 'EMP-001',
    pay_rate: '28.47',
    award_classification: null,
    ...overrides,
  };
}

function makeFakeClient(opts: {
  insertedIds?: string[];
  error?: { message: string };
  capture?: (insertedRows: unknown[]) => void;
}): SupabaseLike {
  return {
    from: () => ({
      insert: (rows: unknown[]) => {
        opts.capture?.(rows);
        return {
          select: async () => ({
            data: opts.error ? null : (opts.insertedIds ?? []).map((id) => ({ id })),
            error: opts.error ?? null,
          }),
        };
      },
    }),
  };
}

describe('bulkInsertWorkers — fast paths', () => {
  it('returns ok: true with zero counts on empty batch', async () => {
    const client = makeFakeClient({ insertedIds: [] });
    const result = await bulkInsertWorkers([], COMPANY_ID, client);
    expect(result).toEqual({ ok: true, inserted_count: 0, inserted_ids: [] });
  });
});

describe('bulkInsertWorkers — tenant isolation', () => {
  it('throws when a row company_id does not match the caller company_id', async () => {
    const rows = [
      makeRow({ company_id: '00000000-9999-0000-0000-000000000099', source_row: 5 }),
    ];
    const client = makeFakeClient({ insertedIds: [] });
    await expect(bulkInsertWorkers(rows, COMPANY_ID, client)).rejects.toThrow(
      /tenant mismatch.*source_row=5/,
    );
  });
});

describe('bulkInsertWorkers — duplicate detection', () => {
  it('throws on duplicate employee_id within batch', async () => {
    const rows = [
      makeRow({ source_row: 2, employee_id: 'DUP-1' }),
      makeRow({ source_row: 5, employee_id: 'DUP-1' }),
    ];
    const client = makeFakeClient({ insertedIds: [] });
    await expect(bulkInsertWorkers(rows, COMPANY_ID, client)).rejects.toThrow(
      /duplicate employee_id "DUP-1".*source_row=5.*first seen at source_row=2/,
    );
  });
});

describe('bulkInsertWorkers — phone defensive guard', () => {
  it('throws on non-canonical phone (parser layer skipped)', async () => {
    const rows = [makeRow({ phone: '0413573579', source_row: 7 })];
    const client = makeFakeClient({ insertedIds: [] });
    await expect(bulkInsertWorkers(rows, COMPANY_ID, client)).rejects.toThrow(
      /non-canonical phone.*source_row=7/,
    );
  });
});

describe('bulkInsertWorkers — happy path', () => {
  it('inserts a single row and returns its id', async () => {
    const rows = [makeRow()];
    const client = makeFakeClient({ insertedIds: ['worker-123'] });
    const result = await bulkInsertWorkers(rows, COMPANY_ID, client);
    expect(result).toEqual({
      ok: true,
      inserted_count: 1,
      inserted_ids: ['worker-123'],
    });
  });

  it('inserts multiple rows and collects ids', async () => {
    const rows = [
      makeRow({ source_row: 2, employee_id: 'E-1' }),
      makeRow({ source_row: 3, employee_id: 'E-2' }),
      makeRow({ source_row: 4, employee_id: 'E-3' }),
    ];
    const client = makeFakeClient({ insertedIds: ['w-1', 'w-2', 'w-3'] });
    const result = await bulkInsertWorkers(rows, COMPANY_ID, client);
    expect(result.ok).toBe(true);
    expect(result.inserted_count).toBe(3);
    expect(result.inserted_ids).toEqual(['w-1', 'w-2', 'w-3']);
  });

  it('strips source_row from the insert payload', async () => {
    const rows = [makeRow({ source_row: 42 })];
    const captured: unknown[] = [];
    const client = makeFakeClient({
      insertedIds: ['w-1'],
      capture: (rs) => captured.push(...rs),
    });
    await bulkInsertWorkers(rows, COMPANY_ID, client);
    expect(captured).toHaveLength(1);
    expect(captured[0]).not.toHaveProperty('source_row');
    expect(captured[0]).toMatchObject({
      company_id: COMPANY_ID,
      first_name: 'Joao',
      employee_id: 'EMP-001',
      phone: '+61413573579',
    });
  });
});

describe('bulkInsertWorkers — DB error path', () => {
  it('returns ok: false on Postgres error (does not throw)', async () => {
    const rows = [makeRow()];
    const client = makeFakeClient({
      error: { message: 'duplicate key value violates unique constraint' },
    });
    const result = await bulkInsertWorkers(rows, COMPANY_ID, client);
    expect(result.ok).toBe(false);
    expect(result.inserted_count).toBe(0);
    expect(result.inserted_ids).toEqual([]);
    expect(result.error).toMatch(/duplicate key/);
  });

  it('does not partially commit on DB error', async () => {
    const rows = [
      makeRow({ source_row: 2, employee_id: 'E-1' }),
      makeRow({ source_row: 3, employee_id: 'E-2' }),
    ];
    const client = makeFakeClient({ error: { message: 'foreign key violation' } });
    const result = await bulkInsertWorkers(rows, COMPANY_ID, client);
    expect(result.ok).toBe(false);
    expect(result.inserted_count).toBe(0);
  });
});

describe('bulkInsertWorkers — Supabase wiring contract', () => {
  it('calls .from("workers").insert(...).select("id") in that order', async () => {
    const fromSpy = vi.fn();
    const insertSpy = vi.fn();
    const selectSpy = vi.fn().mockResolvedValue({ data: [{ id: 'w-1' }], error: null });

    const client: SupabaseLike = {
      from: (table) => {
        fromSpy(table);
        return {
          insert: (rows) => {
            insertSpy(rows);
            return { select: selectSpy };
          },
        };
      },
    };

    await bulkInsertWorkers([makeRow()], COMPANY_ID, client);

    expect(fromSpy).toHaveBeenCalledWith('workers');
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(selectSpy).toHaveBeenCalledWith('id');
  });
});
