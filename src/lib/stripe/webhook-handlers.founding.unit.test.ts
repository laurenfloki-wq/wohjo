// CRACK 191 — unit tests for the inline founding-spot allocation path.
//
// Tests exercise the three outcomes of the optimistic-lock decrement:
//   1. Cohort full before read (spots_remaining <= 0)
//   2. Optimistic-lock race (0 rows updated after concurrent write)
//   3. Successful allocation — correct cohort position returned
//
// The handler is tested via a minimal stub that reproduces the
// allocation logic from onCheckoutSessionCompleted without pulling in
// the full Stripe/Supabase handler dependencies.

import { describe, it, expect } from 'vitest';

// Re-implement the allocation sub-routine in isolation so the test is
// independent of the Supabase client import. Same mirror pattern as
// worker-signin-anomaly.unit.test.ts — integration tests cover the
// live path.

async function allocateFoundingSpot(supabase: {
  from: (t: string) => {
    select: (c: string) => {
      eq: (k: string, v: string) => {
        single: () => Promise<{ data: { value: string } | null; error: { message: string } | null }>;
      };
    };
    update: (row: { value: string }) => {
      eq: (k: string, v: string) => {
        eq: (k2: string, v2: string) => {
          select: (c: string) => Promise<{
            data: { key: string }[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
}): Promise<
  | { ok: true; foundingSpot: number }
  | { ok: false; reason: 'full' | 'read_error' | 'update_error' | 'race' }
> {
  const { data: configRow, error: readErr } = await supabase
    .from('founding_config')
    .select('value')
    .eq('key', 'spots_remaining')
    .single();

  if (readErr || !configRow) {
    return { ok: false, reason: 'read_error' };
  }

  const currentRemaining = parseInt(configRow.value, 10);
  if (isNaN(currentRemaining) || currentRemaining <= 0) {
    return { ok: false, reason: 'full' };
  }

  const newRemaining = currentRemaining - 1;
  const { data: updated, error: updateErr } = await supabase
    .from('founding_config')
    .update({ value: String(newRemaining) })
    .eq('key', 'spots_remaining')
    .eq('value', String(currentRemaining))
    .select('key');

  if (updateErr) return { ok: false, reason: 'update_error' };
  if (!updated || updated.length === 0) return { ok: false, reason: 'race' };

  return { ok: true, foundingSpot: 20 - newRemaining };
}

function makeSupabase(opts: {
  readValue?: string;
  readError?: string;
  updatedRows?: { key: string }[];
  updateError?: string;
}) {
  return {
    from: (_table: string) => ({
      select: (_col: string) => ({
        eq: (_k: string, _v: string) => ({
          single: async () => ({
            data: opts.readError ? null : opts.readValue ? { value: opts.readValue } : null,
            error: opts.readError ? { message: opts.readError } : null,
          }),
        }),
      }),
      update: (_row: { value: string }) => ({
        eq: (_k: string, _v: string) => ({
          eq: (_k2: string, _v2: string) => ({
            select: async (_c: string) => ({
              data: opts.updateError ? null : (opts.updatedRows ?? [{ key: 'spots_remaining' }]),
              error: opts.updateError ? { message: opts.updateError } : null,
            }),
          }),
        }),
      }),
    }),
  };
}

describe('allocateFoundingSpot — cohort full', () => {
  it('returns full when spots_remaining is 0', async () => {
    const result = await allocateFoundingSpot(makeSupabase({ readValue: '0' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('full');
  });

  it('returns full when spots_remaining is negative', async () => {
    const result = await allocateFoundingSpot(makeSupabase({ readValue: '-1' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('full');
  });
});

describe('allocateFoundingSpot — infrastructure errors', () => {
  it('returns read_error when founding_config row is missing', async () => {
    const result = await allocateFoundingSpot(makeSupabase({ readError: 'PGRST116' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('read_error');
  });
});

describe('allocateFoundingSpot — optimistic lock race', () => {
  it('returns race when 0 rows were updated (concurrent checkout)', async () => {
    const result = await allocateFoundingSpot(makeSupabase({ readValue: '5', updatedRows: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('race');
  });
});

describe('allocateFoundingSpot — successful allocation', () => {
  it('returns cohort position 1 for the first spot (spots_remaining=20→19)', async () => {
    const result = await allocateFoundingSpot(makeSupabase({ readValue: '20' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.foundingSpot).toBe(1);
  });

  it('returns cohort position 20 for the last spot (spots_remaining=1→0)', async () => {
    const result = await allocateFoundingSpot(makeSupabase({ readValue: '1' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.foundingSpot).toBe(20);
  });

  it('returns correct mid-cohort position (spots_remaining=10→9 → position 11)', async () => {
    const result = await allocateFoundingSpot(makeSupabase({ readValue: '10' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.foundingSpot).toBe(11);
  });
});
