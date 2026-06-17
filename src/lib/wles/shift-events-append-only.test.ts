// WLES append-only guard — pins the DB trigger that makes a sealed
// shift_events row structurally immutable. This is the backstop behind the
// "Issue correction" promise that "the original event stays sealed": a
// correction INSERTs a new corrective event and extends the chain; it never
// UPDATEs or DELETEs the sealed original, and now the database itself forbids
// any such mutation — even from the service role.
//
// Source-string assertion over the migrations (no live DB) so it runs in CI.
// The live runtime proof lives in shift-events-immutability behaviour against
// a real Postgres (gated), but the contract that the guard EXISTS is pinned
// here so a refactor can't silently drop it.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');

function migrationsText(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf-8'))
    .join('\n');
}

describe('WLES shift_events is append-only at the database level', () => {
  const sql = migrationsText();

  it('defines a BEFORE UPDATE trigger on shift_events', () => {
    expect(sql).toMatch(/BEFORE UPDATE ON public\.shift_events/i);
  });

  it('defines a BEFORE DELETE trigger on shift_events', () => {
    expect(sql).toMatch(/BEFORE DELETE ON public\.shift_events/i);
  });

  it('both triggers reject the mutation via the append-only guard function', () => {
    expect(sql).toMatch(/reject_shift_events_mutation/);
    expect(sql).toMatch(/append-only/i);
  });

  it('the guard fires for the service role (a plain row-level trigger, not RLS)', () => {
    // RLS/GRANTs do not bind the service role; a row-level BEFORE trigger
    // does. Assert we did not gate the guard behind a role check.
    expect(sql).toMatch(/FOR EACH ROW EXECUTE FUNCTION public\.reject_shift_events_mutation/);
  });
});
