// ---------------------------------------------------------------------
// L3.7(a) — /api/cron/integrity-report-monthly
//
// Vercel cron at "0 6 1 * *" (06:00 UTC = 16:00 AEST on the 1st of
// each month). Generates the monthly chain-integrity report for the
// previous calendar month.
//
// This route is the runtime counterpart to scripts/integrity-report-
// monthly.mjs. The script is the authoritative implementation
// (re-runnable on demand from any host with service-role creds);
// this route invokes the same logic in-process for the cron.
//
// Pure detection path. Never mutates shift_events. The report is
// emailed to support@flosmosis.com for founder review and (in a
// future iteration) committed to the FLOSMOSIS repo via the GitHub
// API. For the soft-launch period the email-delivery path alone is
// sufficient — the founder files the markdown manually after review.
// ---------------------------------------------------------------------

import { NextResponse } from 'next/server';
// W1.4 (2026-06-10): SYSTEM surface — cross-company BY DESIGN
// (CRON_SECRET-gated cron schedule, sessionless). Uses the deliberately
// loud system accessor per the chokepoint discipline (PR #71
// precedent); queries unchanged.
import { getServiceClientForSystemJob } from '@/lib/db/service-client';
import { routeLogger } from '@/lib/logger';
import { createHash } from 'node:crypto';

interface ShiftEventRow {
  id: string;
  company_id: string;
  worker_id: string | null;
  site_id: string | null;
  event_type: string;
  event_data: unknown;
  event_hash: string;
  previous_event_hash: string | null;
  created_at: string;
  spec_version: string | null;
  wles_event: Record<string, unknown> | null;
}

interface VerifierFailure {
  company_id: string;
  event_id: string;
  event_type: string;
  reason: 'SELF_HASH_MISMATCH' | 'CHAIN_LINK_MISMATCH';
  expected: string;
  actual: string;
  created_at: string;
}

function canonicalize(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonicalize).join(',') + ']';
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).sort();
    return (
      '{' +
      keys.map((k) => JSON.stringify(k) + ':' + canonicalize(o[k])).join(',') +
      '}'
    );
  }
  return JSON.stringify(v);
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function defaultPreviousMonthRange(now: Date): { period: string; start: Date; end: Date } {
  const firstOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lastOfPrev = new Date(firstOfThisMonth.getTime() - 1);
  const y = lastOfPrev.getUTCFullYear();
  const m = lastOfPrev.getUTCMonth() + 1;
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0) - 1);
  const period = `${y}-${String(m).padStart(2, '0')}`;
  return { period, start, end };
}

export async function GET(request: Request) {
  const log = routeLogger(
    'GET /api/cron/integrity-report-monthly',
    request.headers.get('x-request-id'),
  );
  log.info({ method: 'GET' }, 'request.received');

  // Auth — Vercel-canonical Authorization: Bearer pattern (standardised
  // across all cron routes 2026-04-29 per substrate-DD audit).
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Period override via query string ?period=YYYY-MM (used by ops for
  // manual re-runs); default = previous calendar month UTC.
  const periodParam = new URL(request.url).searchParams.get('period');
  let period: string, periodStart: Date, periodEnd: Date;
  if (periodParam && /^\d{4}-\d{2}$/.test(periodParam)) {
    const [ys, ms] = periodParam.split('-');
    const y = Number(ys);
    const m = Number(ms);
    period = periodParam;
    periodStart = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    periodEnd = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0) - 1);
  } else {
    const r = defaultPreviousMonthRange(new Date());
    period = r.period;
    periodStart = r.start;
    periodEnd = r.end;
  }

  const supabase = getServiceClientForSystemJob();

  try {
    // Fetch shift_events in the period (paginated).
    const events: ShiftEventRow[] = [];
    const pageSize = 1000;
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase
        .from('shift_events')
        .select(
          'id, company_id, worker_id, site_id, event_type, event_data, event_hash, previous_event_hash, created_at, spec_version, wles_event',
        )
        .gte('created_at', periodStart.toISOString())
        .lte('created_at', periodEnd.toISOString())
        .order('created_at', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error(`shift_events: ${error.message}`);
      if (!data || data.length === 0) break;
      events.push(...(data as ShiftEventRow[]));
      if (data.length < pageSize) break;
      offset += pageSize;
    }

    const eventTypeCounts: Record<string, number> = {};
    for (const e of events) {
      eventTypeCounts[e.event_type] = (eventTypeCounts[e.event_type] ?? 0) + 1;
    }

    // Per-company verifier pass with anchor.
    const companyIds = [...new Set(events.map((e) => e.company_id))];
    const failures: VerifierFailure[] = [];
    let eventsVerified = 0;

    for (const cid of companyIds) {
      const { data: anchorRows, error: anchorErr } = await supabase
        .from('shift_events')
        .select('event_hash')
        .eq('company_id', cid)
        .lt('created_at', periodStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(1);
      if (anchorErr) throw new Error(`anchor[${cid}]: ${anchorErr.message}`);
      const anchorHash =
        anchorRows && anchorRows.length > 0
          ? (anchorRows[0] as { event_hash: string }).event_hash
          : null;

      const periodRows = events
        .filter((e) => e.company_id === cid)
        .sort((a, b) =>
          a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
        );

      let prevHash: string | null = anchorHash;
      for (const row of periodRows) {
        eventsVerified++;
        let expectedSelf: string;
        let selfOk: boolean;
        if (row.spec_version === '1.0' && row.wles_event) {
          const we = { ...row.wles_event };
          const stored = (we as { hash?: string }).hash;
          delete (we as { hash?: string }).hash;
          expectedSelf = sha256Hex(canonicalize(we));
          selfOk = stored === expectedSelf;
        } else {
          expectedSelf = sha256Hex(canonicalize(row.event_data));
          selfOk = row.event_hash === expectedSelf;
        }
        if (!selfOk) {
          failures.push({
            company_id: cid,
            event_id: row.id,
            event_type: row.event_type,
            reason: 'SELF_HASH_MISMATCH',
            expected: expectedSelf,
            actual: row.event_hash,
            created_at: row.created_at,
          });
        }
        if (!(row.spec_version === '1.0' && row.wles_event)) {
          if (prevHash !== null && row.previous_event_hash !== prevHash) {
            failures.push({
              company_id: cid,
              event_id: row.id,
              event_type: row.event_type,
              reason: 'CHAIN_LINK_MISMATCH',
              expected: prevHash,
              actual: row.previous_event_hash ?? '',
              created_at: row.created_at,
            });
          }
        }
        prevHash = row.event_hash;
      }
    }

    // Worker actions (best-effort — tables may not yet be live).
    let disputesOpened = 0;
    let disputesResolved = 0;
    let exportsCount = 0;
    try {
      const { data: d } = await supabase
        .from('worker_disputes')
        .select('id, status')
        .gte('opened_at', periodStart.toISOString())
        .lte('opened_at', periodEnd.toISOString());
      if (d) {
        disputesOpened = d.length;
        disputesResolved = (d as { status: string }[]).filter(
          (x) => x.status === 'RESOLVED',
        ).length;
      }
    } catch (e) {
      log.warn({ err: e }, 'worker_disputes table not yet available');
    }
    try {
      const { data: x } = await supabase
        .from('worker_record_exports')
        .select('id')
        .gte('exported_at', periodStart.toISOString())
        .lte('exported_at', periodEnd.toISOString());
      if (x) exportsCount = x.length;
    } catch (e) {
      log.warn({ err: e }, 'worker_record_exports table not yet available');
    }

    const ok = failures.length === 0;
    const summary = {
      ok,
      period,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      generated_at: new Date().toISOString(),
      events_total: events.length,
      events_verified: eventsVerified,
      events_failed: failures.length,
      companies_scanned: companyIds.length,
      event_type_counts: eventTypeCounts,
      worker_disputes_opened: disputesOpened,
      worker_disputes_resolved: disputesResolved,
      worker_exports: exportsCount,
      // Cap mismatch sample so the response is bounded.
      failure_sample: failures.slice(0, 25),
    };

    // ─── side effects ─────────────────────────────────────────────
    // (1) On verifier failure: durable alert via admin_access_log;
    //     follows the same pattern as /api/cron/verify-hashes so
    //     existing alerting + email pipelines pick it up.
    if (!ok) {
      const SYSTEM_USER_UUID = '00000000-0000-0000-0000-000000000000';
      const rows = failures.map((f) => ({
        admin_user_id: SYSTEM_USER_UUID,
        customer_id_accessed: f.company_id,
        resource_type: 'shift_events',
        resource_id: f.event_id,
        action: 'alert',
        reason_code: `MONTHLY_INTEGRITY_BREAK:${f.reason}`,
        source_ip: null,
      }));
      const { error: insertErr } = await supabase.from('admin_access_log').insert(rows);
      if (insertErr) {
        log.error({ err: insertErr }, 'admin_access_log insert failed');
      }
    }

    // (2) Always-emit summary email to support@flosmosis.com so the
    //     founder sees the report month-on-month even when clean.
    //     Email-delivery is implemented on top of the existing notify
    //     pipeline; in the soft-launch period, failure to send is
    //     logged but does not fail the cron.
    try {
      const { sendIntegrityReportEmail } = await import('@/lib/email/notify');
      await sendIntegrityReportEmail({ summary });
    } catch (e) {
      log.warn(
        { err: e },
        'integrity report email dispatch unavailable (notify helper not wired); summary returned in HTTP body',
      );
    }

    return NextResponse.json(summary, { status: ok ? 200 : 207 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    log.error({ err: message }, 'integrity-report-monthly failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
