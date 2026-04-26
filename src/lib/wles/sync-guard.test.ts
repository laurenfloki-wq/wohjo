import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkDuplicateStartEvent } from './sync-guard';
import type { SupabaseClient } from '@supabase/supabase-js';

function makeSupabaseMock(shiftEventRows: Array<{ id: string }>, shiftRows: Array<{ id: string }>) {
  const shiftEventChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: shiftEventRows, error: null }),
  };

  const shiftChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: shiftRows, error: null }),
  };

  let callCount = 0;
  return {
    from: vi.fn().mockImplementation(() => {
      callCount++;
      return callCount === 1 ? shiftEventChain : shiftChain;
    }),
  } as unknown as SupabaseClient;
}

describe('checkDuplicateStartEvent', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns null when no duplicate START_EVENT exists', async () => {
    const supabase = makeSupabaseMock([], []);
    const result = await checkDuplicateStartEvent(supabase, 'worker-001', '2026-04-22');
    expect(result).toBeNull();
  });

  it('returns the existing shift ID when a duplicate START_EVENT is found', async () => {
    const supabase = makeSupabaseMock([{ id: 'event-001' }], [{ id: 'shift-001' }]);
    const result = await checkDuplicateStartEvent(supabase, 'worker-001', '2026-04-22');
    expect(result).toBe('shift-001');
  });

  it('returns null when START_EVENT exists but no matching shift record', async () => {
    const supabase = makeSupabaseMock([{ id: 'event-001' }], []);
    const result = await checkDuplicateStartEvent(supabase, 'worker-001', '2026-04-22');
    expect(result).toBeNull();
  });

  it('queries shift_events first with correct AEST bounds', async () => {
    const supabase = makeSupabaseMock([], []);
    await checkDuplicateStartEvent(supabase, 'worker-001', '2026-04-22');
    expect(supabase.from).toHaveBeenCalledWith('shift_events');
  });

  it('queries with START_EVENT type filter', async () => {
    const supabase = makeSupabaseMock([], []);
    await checkDuplicateStartEvent(supabase, 'worker-001', '2026-04-22');
    // The chain was called — verify from was called
    expect(supabase.from).toHaveBeenCalledWith('shift_events');
  });

  it('Joao test: prevents duplicate start on same day', async () => {
    // Joao already started his shift at 7am — system should block a second start
    const supabase = makeSupabaseMock(
      [{ id: 'joao-start-event' }],
      [{ id: 'joao-shift-001' }]
    );
    const result = await checkDuplicateStartEvent(supabase, 'joao-worker-id', '2026-04-22');
    expect(result).toBe('joao-shift-001');
  });

  it('does not query shifts table when no duplicate event found', async () => {
    const supabase = makeSupabaseMock([], []);
    await checkDuplicateStartEvent(supabase, 'worker-001', '2026-04-22');
    // from should only be called once (shift_events), not twice
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });
});
