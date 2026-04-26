// Flostruction Audit — Audit Pack Generator
// Produces a comprehensive audit record for a pay period.
// Includes all WLES events with hash chain verification.

import { createServiceClient } from '@/lib/supabase/server';
import { generateEventHash } from '@/lib/wles/hash';
import type { AuditPack, AuditShiftEvent, AuditShiftSummary } from './types';

interface GenerateAuditPackParams {
  companyId: string;
  periodStart: string;   // YYYY-MM-DD
  periodEnd: string;     // YYYY-MM-DD
}

// Raw row shapes from Supabase queries
interface ShiftRow {
  id: string;
  company_id: string | null;
  worker_id: string | null;
  site_id: string | null;
  shift_date: string;
  start_time: string;
  end_time: string | null;
  break_minutes: number | null;
  total_hours: string | null;
  status: string;
  receipt_id: string;
  workers: {
    first_name: string;
    last_name: string;
    employee_id: string;
  } | null;
  sites: {
    name: string;
  } | null;
}

interface EventRow {
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

/**
 * Verify hash chain integrity for a sequence of events.
 * Events must be sorted by created_at ascending.
 * Returns list of event IDs with broken hashes.
 */
function verifyEventChain(events: AuditShiftEvent[]): string[] {
  const broken: string[] = [];

  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    // Verify the hash itself
    const expectedHash = generateEventHash({
      company_id: event.company_id,
      worker_id: event.worker_id,
      site_id: event.site_id,
      event_type: event.event_type,
      event_data: event.event_data,
      created_at: new Date(event.created_at),
    });

    if (event.event_hash !== expectedHash) {
      broken.push(event.id);
      continue;
    }

    // Verify chain link to previous event
    if (i > 0) {
      const prevEvent = events[i - 1];
      if (event.previous_event_hash !== prevEvent.event_hash) {
        broken.push(event.id);
      }
    }
  }

  return broken;
}

/**
 * Generate a complete audit pack for a company's pay period.
 * Fetches all shifts and their WLES events, verifies hash chains.
 */
export async function generateAuditPack(
  params: GenerateAuditPackParams
): Promise<AuditPack> {
  const { companyId, periodStart, periodEnd } = params;
  const supabase = createServiceClient();

  // 1. Fetch all shifts in the period (any status — audit sees everything)
  const { data: shifts, error: shiftError } = await supabase
    .from('shifts')
    .select(`
      id,
      company_id,
      worker_id,
      site_id,
      shift_date,
      start_time,
      end_time,
      break_minutes,
      total_hours,
      status,
      receipt_id,
      workers(first_name, last_name, employee_id),
      sites(name)
    `)
    .eq('company_id', companyId)
    .gte('shift_date', periodStart)
    .lte('shift_date', periodEnd)
    .order('shift_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (shiftError) {
    throw new Error(`Failed to fetch shifts for audit: ${shiftError.message}`);
  }

  const shiftRows = (shifts ?? []) as unknown as ShiftRow[];

  // 2. Fetch all events for shifts in the period
  const shiftIds = shiftRows.map((s) => s.id);

  // Events may reference shifts via event_data.shift_id
  // Also fetch by worker_id + date range for complete picture
  const workerIds = [...new Set(shiftRows.map((s) => s.worker_id).filter(Boolean))];

  let eventRows: EventRow[] = [];
  if (workerIds.length > 0) {
    const { data: events, error: eventError } = await supabase
      .from('shift_events')
      .select('*')
      .eq('company_id', companyId)
      .in('worker_id', workerIds)
      .gte('created_at', `${periodStart}T00:00:00.000Z`)
      .lte('created_at', `${periodEnd}T23:59:59.999Z`)
      .order('created_at', { ascending: true });

    if (eventError) {
      throw new Error(`Failed to fetch events for audit: ${eventError.message}`);
    }

    eventRows = (events ?? []) as unknown as EventRow[];
  }

  // 3. Group events by worker_id (hash chain is per worker)
  const eventsByWorker = new Map<string, EventRow[]>();
  for (const event of eventRows) {
    const existing = eventsByWorker.get(event.worker_id) ?? [];
    existing.push(event);
    eventsByWorker.set(event.worker_id, existing);
  }

  // 4. Build audit shift summaries
  const auditShifts: AuditShiftSummary[] = [];
  const allBrokenChains: string[] = [];
  let totalHours = 0;
  let totalEvents = 0;

  for (const row of shiftRows) {
    const worker = row.workers;
    const site = row.sites;
    const workerId = row.worker_id ?? '';

    // Get events for this worker, filter to those related to this shift
    const workerEvents = eventsByWorker.get(workerId) ?? [];
    const shiftEvents: AuditShiftEvent[] = workerEvents
      .filter((e) => {
        // Match events that reference this shift in event_data
        const eventShiftId = e.event_data?.shift_id as string | undefined;
        return eventShiftId === row.id;
      })
      .map((e) => ({
        id: e.id,
        company_id: e.company_id,
        worker_id: e.worker_id,
        site_id: e.site_id,
        event_type: e.event_type,
        event_data: e.event_data,
        device_metadata: e.device_metadata,
        event_hash: e.event_hash,
        previous_event_hash: e.previous_event_hash,
        created_at: e.created_at,
        created_by: e.created_by,
      }));

    // Verify hash chain for this shift's events
    const brokenEvents = verifyEventChain(shiftEvents);
    const chainValid = brokenEvents.length === 0;

    if (!chainValid) {
      allBrokenChains.push(row.id);
    }

    const hours = parseFloat(row.total_hours ?? '0');
    totalHours += hours;
    totalEvents += shiftEvents.length;

    auditShifts.push({
      shift_id: row.id,
      worker_name: worker
        ? `${worker.first_name} ${worker.last_name}`
        : 'Unknown',
      worker_employee_id: worker?.employee_id ?? '',
      site_name: site?.name ?? 'Unknown',
      shift_date: row.shift_date,
      start_time: row.start_time,
      end_time: row.end_time ?? '',
      break_minutes: row.break_minutes ?? 0,
      total_hours: hours,
      status: row.status,
      receipt_id: row.receipt_id,
      events: shiftEvents,
      hash_chain_valid: chainValid,
    });
  }

  return {
    generated_at: new Date().toISOString(),
    company_id: companyId,
    period_start: periodStart,
    period_end: periodEnd,
    total_shifts: shiftRows.length,
    total_events: totalEvents,
    total_hours: parseFloat(totalHours.toFixed(2)),
    hash_chain_integrity: allBrokenChains.length === 0 ? 'VERIFIED' : 'BROKEN',
    broken_chains: allBrokenChains,
    shifts: auditShifts,
  };
}
