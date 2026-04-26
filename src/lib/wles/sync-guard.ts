import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Checks for a duplicate START_EVENT for the same worker + shift_date (AEST).
 * Returns existing shift ID if duplicate found, null if safe to proceed.
 * Non-negotiable: implemented in every shift start route.
 */
export async function checkDuplicateStartEvent(
  supabase: SupabaseClient,
  workerId: string,
  shiftDate: string // YYYY-MM-DD in AEST
): Promise<string | null> {
  const { data: events } = await supabase
    .from('shift_events')
    .select('id')
    .eq('worker_id', workerId)
    .eq('event_type', 'START_EVENT')
    .gte('created_at', shiftDate + 'T00:00:00+10:00')
    .lt('created_at', shiftDate + 'T23:59:59+10:00')
    .limit(1);

  if (events && events.length > 0) {
    const { data: shift } = await supabase
      .from('shifts')
      .select('id')
      .eq('worker_id', workerId)
      .eq('shift_date', shiftDate)
      .limit(1);
    return shift?.[0]?.id ?? null;
  }
  return null;
}
