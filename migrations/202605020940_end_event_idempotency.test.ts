// Saturday Task 6 — schema-shape guard for migration
// migrations/202605020940_end_event_idempotency.sql.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATION = fs.readFileSync(
  path.join(process.cwd(), 'migrations/202605020940_end_event_idempotency.sql'),
  'utf-8',
);

describe('Migration 202605020940 — END_EVENT idempotency partial index', () => {
  it('creates a UNIQUE INDEX named uq_shift_events_end_idempotent', () => {
    expect(MIGRATION).toMatch(/CREATE UNIQUE INDEX[\s\S]*?uq_shift_events_end_idempotent/);
  });

  it('is a partial index scoped to event_type = END_EVENT', () => {
    expect(MIGRATION).toMatch(/WHERE event_type = 'END_EVENT'/);
  });

  it('is also scoped to rows that carry a client_event_id key', () => {
    expect(MIGRATION).toMatch(/event_data \? 'client_event_id'/);
  });

  it('indexes (worker_id, event_data->>client_event_id) — per-worker dedup', () => {
    expect(MIGRATION).toMatch(
      /\(worker_id, \(event_data->>'client_event_id'\)\)/,
    );
  });

  it('uses IF NOT EXISTS (re-runnable without error)', () => {
    expect(MIGRATION).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS/);
  });

  it('does NOT auto-apply (header explicitly notes Lauren-side application)', () => {
    expect(MIGRATION).toMatch(/DO NOT auto-apply/);
  });

  it('preserves Joao E2E sacred zone (header explicitly notes Joao 1-May row unaffected)', () => {
    expect(MIGRATION).toMatch(/Joao E2E test sacred zone/);
    expect(MIGRATION).toMatch(/1-May START_EVENT row/);
  });

  it('attaches a COMMENT ON INDEX documenting the application contract', () => {
    expect(MIGRATION).toMatch(/COMMENT ON INDEX public\.uq_shift_events_end_idempotent/);
    expect(MIGRATION).toMatch(/error 23505/);
  });
});
