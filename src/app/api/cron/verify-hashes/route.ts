// ---------------------------------------------------------------
// B5 — /api/cron/verify-hashes
// Daily WLES hash-chain verification. Runs at 03:00 AEST (17:00 UTC
// previous day) via Vercel Cron. For each company, walks shift_events
// in chronological order and recomputes every event's SHA-256 plus
// the previous_event_hash linkage. On any mismatch:
//   1. Insert a critical alert row into admin_access_log
//   2. Email the platform operator (Lauren) via Resend
//
// Pure detection path. Never mutates shift_events. Does not short-
// circuit on the first mismatch — scans the full chain so one call
// captures every breakage.
// ---------------------------------------------------------------

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { routeLogger } from '@/lib/logger';
import {
  verifyCompanyChain,
  type ChainMismatch,
  type ShiftEventRow,
} from '@/lib/wles/chain-verify';
import {
  notifyChainIntegrityAlert,
  type ChainMismatchLine,
} from '@/lib/email/notify';
import { verifyEvent as verifyV1Event } from '@/lib/wles/v1';
import type { WlesEvent } from '@/lib/wles/v1-types';

// UUID used for admin_user_id on system-generated alerts. Not a real
// user — conventionally zero-uuid — kept here so SQL filters can
// cleanly distinguish system alerts from human admin actions.
const SYSTEM_USER_UUID = '00000000-0000-0000-0000-000000000000';

// Hard cap on per-company events pulled in a single sweep. Far above
// expected early-stage traffic; prevents runaway memory if a bad
// company id ever shares the partition.
const MAX_EVENTS_PER_COMPANY = 50_000;

async function listCompanyIds(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('companies')
    .select('id');
  if (error) throw new Error(`list companies: ${error.message}`);
  return (data ?? []).map((r: { id: string }) => r.id);
}

interface ShiftEventRowV2 extends ShiftEventRow {
  spec_version?: string | null;
  wles_event?: WlesEvent | null;
}

async function fetchEventsForCompany(
  supabase: ReturnType<typeof createServiceClient>,
  companyId: string,
): Promise<ShiftEventRowV2[]> {
  const { data, error } = await supabase
    .from('shift_events')
    .select(
      'id, company_id, worker_id, site_id, event_type, event_data, event_hash, previous_event_hash, created_at, spec_version, wles_event',
    )
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(MAX_EVENTS_PER_COMPANY);
  if (error) throw new Error(`fetch shift_events[${companyId}]: ${error.message}`);
  return (data ?? []) as ShiftEventRowV2[];
}

/**
 * Dual-mode verification entry point. Events labelled
 * spec_version='1.0' with a populated wles_event jsonb are checked
 * via the WLES v1.0 verifier (canonical-JSON + SHA-256). Other
 * events fall through to the legacy verifyCompanyChain pass.
 *
 * Per Annex v2.1 §1A(b) and §4a-§4b, v0 and v1.0 chains attach
 * their own s 146 presumptions and verify independently; a court
 * is not required to elect between the two algorithms to assess
 * any record.
 */
function verifyV1Portion(rows: ShiftEventRowV2[]): {
  legacyRows: ShiftEventRow[];
  v1Mismatches: ChainMismatch[];
} {
  const legacyRows: ShiftEventRow[] = [];
  const v1Mismatches: ChainMismatch[] = [];
  for (const row of rows) {
    if (row.spec_version === '1.0' && row.wles_event) {
      const result = verifyV1Event(row.wles_event as WlesEvent);
      if (!result.ok) {
        v1Mismatches.push({
          event_id: row.id,
          company_id: row.company_id,
          event_type: row.event_type,
          reason: 'SELF_HASH_MISMATCH',
          expected: result.expected ?? '',
          actual: result.actual ?? row.event_hash,
          created_at: typeof row.created_at === 'string'
            ? row.created_at
            : new Date(row.created_at).toISOString(),
        });
      }
      // v1.0 events are not included in the legacy chain-link pass.
      continue;
    }
    legacyRows.push(row);
  }
  return { legacyRows, v1Mismatches };
}

async function writeAlertRows(
  supabase: ReturnType<typeof createServiceClient>,
  mismatches: ChainMismatch[],
): Promise<void> {
  if (mismatches.length === 0) return;
  const rows = mismatches.map((m) => ({
    admin_user_id: SYSTEM_USER_UUID,
    customer_id_accessed: m.company_id,
    resource_type: 'shift_events',
    resource_id: m.event_id,
    action: 'alert',
    reason_code: `CHAIN_BREAK:${m.reason}`,
    source_ip: null,
  }));
  const { error } = await supabase.from('admin_access_log').insert(rows);
  if (error) throw new Error(`admin_access_log insert: ${error.message}`);
}

function toAlertLines(mismatches: ChainMismatch[]): ChainMismatchLine[] {
  return mismatches.map((m) => ({
    company_id: m.company_id,
    event_id: m.event_id,
    event_type: m.event_type,
    reason: m.reason,
    expected: m.expected,
    actual: m.actual,
    created_at: m.created_at,
  }));
}

export async function GET(request: Request) {
  const log = routeLogger('GET /api/cron/verify-hashes', request.headers.get('x-request-id'));
  log.info({ method: 'GET' }, 'request.received');
  // Auth — matches pattern of other cron routes.
  const secret =
    request.headers.get('x-cron-secret') ??
    new URL(request.url).searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const scanStartedAt = new Date().toISOString();
  const supabase = createServiceClient();

  try {
    const companyIds = await listCompanyIds(supabase);

    let totalEvents = 0;
    const allMismatches: ChainMismatch[] = [];
    const perCompany: Array<{
      company_id: string;
      events: number;
      ok: boolean;
      mismatches: number;
    }> = [];

    for (const companyId of companyIds) {
      const allRows = await fetchEventsForCompany(supabase, companyId);
      // Split into v1 and legacy (v0) portions — each verifies on its
      // own terms per Annex v2.1 §1A(b).
      const { legacyRows, v1Mismatches } = verifyV1Portion(allRows);
      const report = verifyCompanyChain(legacyRows);
      totalEvents += allRows.length;
      const combinedMismatches = report.mismatches.length + v1Mismatches.length;
      perCompany.push({
        company_id: companyId,
        events: allRows.length,
        ok: report.ok && v1Mismatches.length === 0,
        mismatches: combinedMismatches,
      });
      if (!report.ok) allMismatches.push(...report.mismatches);
      if (v1Mismatches.length > 0) allMismatches.push(...v1Mismatches);
    }

    const scanFinishedAt = new Date().toISOString();
    const ok = allMismatches.length === 0;

    if (!ok) {
      // Order matters: record first (durable), then email (best-effort).
      await writeAlertRows(supabase, allMismatches);
      try {
        await notifyChainIntegrityAlert({
          companiesScanned: companyIds.length,
          eventsScanned: totalEvents,
          mismatches: toAlertLines(allMismatches),
          scanStartedAt,
          scanFinishedAt,
        });
      } catch (emailErr) {
        // Email failure does not fail the cron — alert row is on record.
        log.error({ err: emailErr }, 'chain-verify: email dispatch failed');
      }
    }

    return NextResponse.json({
      ok,
      scan_started_at: scanStartedAt,
      scan_finished_at: scanFinishedAt,
      companies_scanned: companyIds.length,
      events_scanned: totalEvents,
      mismatches: allMismatches.length,
      per_company: perCompany,
      // Truncated mismatch preview so the HTTP response is bounded.
      mismatch_sample: allMismatches.slice(0, 10),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
