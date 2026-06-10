// Flostruction Command — Intelligence Log API
// GET /api/command/intelligence
// Returns recent shifts with intelligence analysis results for Flostruction Command.
// Server-side only — uses service role key (non-negotiable).

import { NextResponse } from 'next/server';
import { shiftsRepo, shiftEventsRepo } from '@/lib/db/repositories/shifts.repo';
import { confidenceLabel } from '@/lib/intelligence/rules';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';

import { routeLogger } from '@/lib/logger';
export interface IntelligenceLogEntry {
  shift_id: string;
  receipt_id: string;
  shift_date: string;
  worker_first_name: string;
  worker_last_name: string;
  site_name: string | null;
  total_hours: string;
  status: string;
  confidence_score: number;
  confidence_label: string;
  confidence_colour: 'green' | 'amber' | 'red';
  anomaly_flags: Array<{
    ruleId: string;
    severity: string;
    explanation: string;
    action: string;
  }>;
  intelligence_status: 'VERIFIED' | 'FLAGGED' | 'PENDING';
  flag_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
}

// Local type for the Supabase join query result — fixes implicit any on map/filter callbacks
interface ShiftQueryRow {
  id: string;
  receipt_id: string;
  shift_date: string;
  total_hours: string | null;
  status: string;
  confidence_score: number | null;
  anomaly_flags: unknown;
  worker_id: string;
  site_id: string | null;
  workers: { first_name: string; last_name: string };
  sites: { name: string } | null;
}

export async function GET(request: Request) {
  const log = routeLogger('GET /api/command/intelligence', request.headers.get('x-request-id'));
  log.info({ method: 'GET' }, 'request.received');

  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100);
  const daysBack = parseInt(searchParams.get('days') ?? '7');

  const repo = shiftsRepo(companyId);
  const evRepo = shiftEventsRepo(companyId);

  // Date range: last N days
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - daysBack);
  const fromDateStr = fromDate.toISOString().split('T')[0];

  // GAP-A3-001 closure: always scope to session's companyId.
  const { data: shifts, error } = await repo.listForIntelligence(fromDateStr, limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Cast to local type — Supabase join queries return complex inferred types
  const typedShifts = (shifts ?? []) as ShiftQueryRow[];

  // Get all shift IDs to check intelligence event status
  const shiftIds = typedShifts.map((s: ShiftQueryRow) => s.id);

  // Fetch INTELLIGENCE_CLEAR events scoped to this company.
  const { data: clearEvents } = await evRepo.listEventData('INTELLIGENCE_CLEAR', [...new Set(typedShifts.map((s: ShiftQueryRow) => s.worker_id))]);

  // Fetch ANOMALY_FLAG events scoped to this company.
  const { data: flagEvents } = await evRepo.listEventData('ANOMALY_FLAG', [...new Set(typedShifts.map((s: ShiftQueryRow) => s.worker_id))]);

  // Build sets of shift IDs that have INTELLIGENCE_CLEAR or ANOMALY_FLAG
  const clearedShiftIds = new Set<string>(
    (clearEvents ?? [])
      .map((e: { event_data: unknown }) => (e.event_data as { shift_id?: string }).shift_id)
      .filter((id: unknown): id is string => !!id && shiftIds.includes(id as string))
  );
  const flaggedShiftIds = new Set<string>(
    (flagEvents ?? [])
      .map((e: { event_data: unknown }) => (e.event_data as { shift_id?: string }).shift_id)
      .filter((id: unknown): id is string => !!id && shiftIds.includes(id as string))
  );

  const entries: IntelligenceLogEntry[] = typedShifts.map((shift: ShiftQueryRow) => {
    const worker = shift.workers;
    const site = shift.sites;
    const score = shift.confidence_score ?? 50;
    const { label, colour } = confidenceLabel(score);

    // Safely cast anomaly_flags from jsonb
    const flags = (shift.anomaly_flags as Array<{
      ruleId: string;
      severity: string;
      explanation: string;
      action: string;
    }>) ?? [];

    const highCount = flags.filter((f: { severity: string }) => f.severity === 'HIGH').length;
    const mediumCount = flags.filter((f: { severity: string }) => f.severity === 'MEDIUM').length;
    const lowCount = flags.filter((f: { severity: string }) => f.severity === 'LOW').length;

    let intelligenceStatus: 'VERIFIED' | 'FLAGGED' | 'PENDING';
    if (clearedShiftIds.has(shift.id)) {
      intelligenceStatus = 'VERIFIED';
    } else if (flaggedShiftIds.has(shift.id)) {
      intelligenceStatus = 'FLAGGED';
    } else {
      intelligenceStatus = 'PENDING';
    }

    return {
      shift_id: shift.id,
      receipt_id: shift.receipt_id,
      shift_date: shift.shift_date,
      worker_first_name: worker.first_name,
      worker_last_name: worker.last_name,
      site_name: site?.name ?? null,
      total_hours: parseFloat(shift.total_hours ?? '0').toFixed(1),
      status: shift.status,
      confidence_score: score,
      confidence_label: label,
      confidence_colour: colour,
      anomaly_flags: flags,
      intelligence_status: intelligenceStatus,
      flag_count: flags.length,
      high_count: highCount,
      medium_count: mediumCount,
      low_count: lowCount,
    };
  });

  // Summary stats
  const verifiedCount = entries.filter((e: IntelligenceLogEntry) => e.intelligence_status === 'VERIFIED').length;
  const flaggedCount = entries.filter((e: IntelligenceLogEntry) => e.intelligence_status === 'FLAGGED').length;
  const pendingCount = entries.filter((e: IntelligenceLogEntry) => e.intelligence_status === 'PENDING').length;

  return NextResponse.json({
    entries,
    summary: {
      total: entries.length,
      verified: verifiedCount,
      flagged: flaggedCount,
      pending: pendingCount,
      days_shown: daysBack,
    },
  });
}
