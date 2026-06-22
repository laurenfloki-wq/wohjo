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
//
// SG-4 / Dispatch 2 Workstream A (2026-06-12): verification is now
// SPEC-VERSION-AWARE (chain-verify-spec-aware.ts). Each event is
// recomputed under the method it was sealed with — v0 canonical,
// CRACK 72-annotated, pre-canonicalisation insertion order, or WLES
// v1.0 — with v0 segment-genesis linkage semantics and v1 §8.2 chain
// linkage. The raw check is expected GREEN (mismatch_count = 0) on
// clean data; RED now means genuine tampering. v1 failure reasons are
// preserved (no longer collapsed into SELF_HASH_MISMATCH).
// ---------------------------------------------------------------

import { NextResponse } from 'next/server';
// W1.4 (2026-06-10): SYSTEM surface — cross-company BY DESIGN
// (CRON_SECRET-gated cron schedule, sessionless). Uses the deliberately
// loud system accessor per the chokepoint discipline (PR #71
// precedent); queries unchanged.
import { getServiceClientForSystemJob } from '@/lib/db/service-client';
import { routeLogger } from '@/lib/logger';
import {
  verifyCompanyChainSpecAware,
  type ShiftEventRowSpecAware,
  type SpecAwareMismatch,
  type SpecAwareNote,
} from '@/lib/wles/chain-verify-spec-aware';
import { notifyChainIntegrityAlert, type ChainMismatchLine } from '@/lib/email/notify';
// Phase 3 / OBS-2: human ping alongside the durable alert rows — fans out
// across email + SMS (out-of-band) + Slack so no single channel outage hides it.
import { dispatchOpsAlert } from '@/lib/observability/ops-alert';
// OBS-3 — dead-man's-switch: verify-hashes confirms substrate-health ran.
import { isCronFresh } from '@/lib/observability/cron-freshness';
import { CHAIN_BASELINE_ID, CHAIN_BASELINE_EVENT_IDS } from '@/lib/wles/chain-baseline';
// A1 — live v1 count high-water-mark: detects tail-truncation that self-hash +
// linkage verification cannot see (a deleted tail leaves a valid-looking prefix).
import {
  evaluateCountAnchor,
  type CompanyV1Snapshot,
  type CountAnchorViolation,
  type V1Watermark,
} from '@/lib/wles/count-anchor';

// UUID used for admin_user_id on system-generated alerts. Not a real
// user — conventionally zero-uuid — kept here so SQL filters can
// cleanly distinguish system alerts from human admin actions.
const SYSTEM_USER_UUID = '00000000-0000-0000-0000-000000000000';

// Hard cap on per-company events pulled in a single sweep. Far above
// expected early-stage traffic; prevents runaway memory if a bad
// company id ever shares the partition.
const MAX_EVENTS_PER_COMPANY = 50_000;

async function listCompanyIds(supabase: ReturnType<typeof getServiceClientForSystemJob>): Promise<string[]> {
  const { data, error } = await supabase.from('companies').select('id');
  if (error) throw new Error(`list companies: ${error.message}`);
  return (data ?? []).map((r: { id: string }) => r.id);
}

async function fetchEventsForCompany(
  supabase: ReturnType<typeof getServiceClientForSystemJob>,
  companyId: string,
): Promise<ShiftEventRowSpecAware[]> {
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
  return (data ?? []) as ShiftEventRowSpecAware[];
}

async function writeAlertRows(
  supabase: ReturnType<typeof getServiceClientForSystemJob>,
  mismatches: SpecAwareMismatch[],
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

function toAlertLines(mismatches: SpecAwareMismatch[]): ChainMismatchLine[] {
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
  // Auth — Vercel-canonical Authorization: Bearer pattern (standardised
  // across all cron routes 2026-04-29 per substrate-DD audit).
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const scanStartedAt = new Date().toISOString();
  const supabase = getServiceClientForSystemJob();

  try {
    const companyIds = await listCompanyIds(supabase);

    let totalEvents = 0;
    const allMismatches: SpecAwareMismatch[] = [];
    const pathTally: Record<string, number> = {};
    const allNotes: SpecAwareNote[] = [];
    const perCompany: Array<{
      company_id: string;
      events: number;
      ok: boolean;
      mismatches: number;
    }> = [];
    // A1: per-company live v1 snapshot, compared to the stored watermark below.
    const snapshots: CompanyV1Snapshot[] = [];
    // REL-4: companies whose sweep threw — isolated so one bad tenant can't
    // blind integrity for everyone, but surfaced so it never reads all-clear.
    const failedCompanies: Array<{ company_id: string; error: string }> = [];

    for (const companyId of companyIds) {
      try {
        const allRows = await fetchEventsForCompany(supabase, companyId);
        // Spec-aware dual-mode verification: v0 events recompute under
        // their seal-time method (canonical / CRACK 72-annotated /
        // pre-canonicalisation), v1 events verify per WLES v1.0 §8.
        // Per Annex v2.1 §1A(b) and §4a-§4b, v0 and v1.0 chains attach
        // their own s 146 presumptions and verify independently.
        const report = verifyCompanyChainSpecAware(allRows);
        totalEvents += allRows.length;
        perCompany.push({
          company_id: companyId,
          events: allRows.length,
          ok: report.ok,
          mismatches: report.mismatches.length,
        });
        if (!report.ok) allMismatches.push(...report.mismatches);
        for (const [path, count] of Object.entries(report.path_tally)) {
          pathTally[path] = (pathTally[path] ?? 0) + (count ?? 0);
        }
        allNotes.push(...report.notes);

        // A1: snapshot the live v1 population for the count high-water-mark check.
        let liveV1Count = 0;
        const v1Hashes = new Set<string>();
        for (const r of allRows) {
          if (r.spec_version === '1.0' && r.wles_event != null) {
            liveV1Count++;
            const h = (r.wles_event as { event_hash?: string } | null)?.event_hash ?? r.event_hash;
            if (h) v1Hashes.add(h);
          }
        }
        snapshots.push({ company_id: companyId, liveV1Count, v1Hashes });
      } catch (companyErr) {
        // REL-4 — isolate: log + record + continue. The other companies still
        // get verified, and the failed one is reported (not silently GREEN).
        const msg = companyErr instanceof Error ? companyErr.message : 'unknown';
        log.error({ err: msg, companyId }, 'verify-hashes: company sweep failed (isolated)');
        failedCompanies.push({ company_id: companyId, error: msg });
        perCompany.push({ company_id: companyId, events: 0, ok: false, mismatches: 0 });
      }
    }

    const scanFinishedAt = new Date().toISOString();
    const ok = allMismatches.length === 0;

    // W3/SG-4 (2026-06-11): record the dual-mode outcome in the
    // FLOS-SHA-001 evidentiary health log — best-effort, like the
    // email path: the alert rows below remain the primary record on
    // failure, and a health-log write error must never mask them.
    try {
      const { error: healthErr } = await supabase.from('substrate_health_log').insert({
        check_name: 'chain_integrity_shift_events',
        // REL-4 — a company we couldn't even scan is ERROR (incomplete), never
        // a false GREEN; a clean scan with mismatches is RED.
        status: failedCompanies.length > 0 ? 'ERROR' : ok ? 'GREEN' : 'RED',
        detail: {
          companies_scanned: companyIds.length,
          events_scanned: totalEvents,
          mismatch_count: allMismatches.length,
          failed_companies: failedCompanies.slice(0, 50),
          scan_started_at: scanStartedAt,
          scan_finished_at: scanFinishedAt,
          // Spec-aware observability: which acceptance path verified
          // each event, plus non-default (hash-verified) observations.
          path_tally: pathTally,
          notes: allNotes.slice(0, 50),
        },
        baseline: null,
        duration_ms: Date.parse(scanFinishedAt) - Date.parse(scanStartedAt),
      });
      if (healthErr) {
        log.error({ err: healthErr.message }, 'chain-verify: health log write failed');
      }
    } catch (healthEx) {
      log.error(
        { err: healthEx instanceof Error ? healthEx.message : 'unknown' },
        'chain-verify: health log write failed',
      );
    }

    // Spine ruling 2026-06-12: the operational signal. The raw check
    // above is NEVER filtered; this second record excludes only the
    // adopted known-exceptions baseline (11 pilot-era spec-0 events --
    // see src/lib/wles/chain-baseline.ts and the evidentiary JSON).
    const exBaselineMismatches = allMismatches.filter(
      (m) => !CHAIN_BASELINE_EVENT_IDS.has(m.event_id),
    );
    try {
      const { error: exHealthErr } = await supabase.from('substrate_health_log').insert({
        check_name: 'chain_integrity_shift_events_ex_baseline',
        status: exBaselineMismatches.length === 0 ? 'GREEN' : 'RED',
        detail: {
          companies_scanned: companyIds.length,
          events_scanned: totalEvents,
          mismatch_count: exBaselineMismatches.length,
          baseline_excluded_count: allMismatches.length - exBaselineMismatches.length,
          scan_started_at: scanStartedAt,
          scan_finished_at: scanFinishedAt,
        },
        baseline: { baseline_id: CHAIN_BASELINE_ID },
        duration_ms: Date.parse(scanFinishedAt) - Date.parse(scanStartedAt),
      });
      if (exHealthErr) {
        log.error({ err: exHealthErr.message }, 'chain-verify: ex-baseline health log write failed');
      }
    } catch (exHealthEx) {
      log.error(
        { err: exHealthEx instanceof Error ? exHealthEx.message : 'unknown' },
        'chain-verify: ex-baseline health log write failed',
      );
    }

    // A1 — count high-water-mark check. Linkage/self-hash verification above
    // certifies the events that ARE present; this certifies that none of the
    // sealed v1 events have been DELETED (tail-truncation). Independent health
    // signal + alert so a silent deletion can never read as GREEN.
    let anchorViolations: CountAnchorViolation[] = [];
    try {
      const { data: wmRows, error: wmErr } = await supabase
        .from('wles_v1_watermark')
        .select('company_id, event_count, tail_event_hash');
      if (wmErr) {
        log.error({ err: wmErr.message }, 'chain-verify: watermark fetch failed');
      } else {
        const wmMap = new Map<string, V1Watermark>(
          (wmRows ?? []).map((r: V1Watermark) => [r.company_id, r]),
        );
        anchorViolations = evaluateCountAnchor(snapshots, wmMap);
      }
    } catch (anchorEx) {
      log.error(
        { err: anchorEx instanceof Error ? anchorEx.message : 'unknown' },
        'chain-verify: count-anchor check failed',
      );
    }
    const anchorOk = anchorViolations.length === 0;
    try {
      const { error: aHealthErr } = await supabase.from('substrate_health_log').insert({
        check_name: 'chain_count_anchor',
        status: anchorOk ? 'GREEN' : 'RED',
        detail: {
          companies_scanned: companyIds.length,
          violations: anchorViolations.slice(0, 50),
        },
        baseline: null,
        duration_ms: Date.parse(scanFinishedAt) - Date.parse(scanStartedAt),
      });
      if (aHealthErr) {
        log.error({ err: aHealthErr.message }, 'chain-verify: count-anchor health write failed');
      }
    } catch (aHealthEx) {
      log.error(
        { err: aHealthEx instanceof Error ? aHealthEx.message : 'unknown' },
        'chain-verify: count-anchor health write failed',
      );
    }

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
      void dispatchOpsAlert('WLES chain integrity RED', [
        `${allMismatches.length} mismatch(es) across ${companyIds.length} companies`,
        `events scanned: ${totalEvents}`,
        'Runbook: docs/incident-runbook.md',
      ], { sms: true });
    }

    if (!anchorOk) {
      // Durable record first (resource_id is null — this is a population-level
      // deletion, not a single-event tamper), then best-effort email + ops ping.
      const anchorRows = anchorViolations.map((v) => ({
        admin_user_id: SYSTEM_USER_UUID,
        customer_id_accessed: v.company_id,
        resource_type: 'wles_v1_watermark',
        resource_id: null,
        action: 'alert',
        reason_code: `COUNT_ANCHOR:${v.reason}`,
        source_ip: null,
      }));
      const { error: anchorAlertErr } = await supabase.from('admin_access_log').insert(anchorRows);
      if (anchorAlertErr) {
        log.error({ err: anchorAlertErr.message }, 'chain-verify: anchor alert rows insert failed');
      }
      try {
        await notifyChainIntegrityAlert({
          companiesScanned: companyIds.length,
          eventsScanned: totalEvents,
          mismatches: anchorViolations.map((v) => ({
            company_id: v.company_id,
            event_id: 'COUNT_ANCHOR',
            event_type: 'WLES_V1_WATERMARK',
            reason: v.reason,
            expected: v.expected,
            actual: v.actual,
            created_at: scanFinishedAt,
          })),
          scanStartedAt,
          scanFinishedAt,
        });
      } catch (emailErr) {
        log.error({ err: emailErr }, 'chain-verify: anchor email dispatch failed');
      }
      void dispatchOpsAlert('WLES count-anchor RED — possible event deletion', [
        `${anchorViolations.length} company watermark regression(s)`,
        ...anchorViolations
          .slice(0, 5)
          .map((v) => `${v.company_id}: ${v.reason} (expected ${v.expected}, got ${v.actual})`),
        'Runbook: docs/incident-runbook.md',
      ], { sms: true });
    }

    // OBS-3 — dead-man's-switch: confirm substrate-health itself ran recently.
    // The two daily crons watch each other, so a single cron dying still alarms.
    // (Total Vercel-cron failure still needs an external uptime monitor.)
    let substrateCronOk = true;
    try {
      const { data: lastHealth } = await supabase
        .from('substrate_health_log')
        .select('run_at')
        .eq('check_name', 'anchor_fingerprint')
        .order('run_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const lastRunAt = (lastHealth as { run_at: string } | null)?.run_at ?? null;
      substrateCronOk = isCronFresh(lastRunAt, Date.now());
      const { error: wHealthErr } = await supabase.from('substrate_health_log').insert({
        check_name: 'cron_health_substrate',
        status: substrateCronOk ? 'GREEN' : 'RED',
        detail: { watched: 'substrate-health (anchor_fingerprint)', last_run_at: lastRunAt },
        baseline: null,
        duration_ms: Date.parse(scanFinishedAt) - Date.parse(scanStartedAt),
      });
      if (wHealthErr) {
        log.error({ err: wHealthErr.message }, 'verify-hashes: cron_health_substrate write failed');
      }
    } catch (wEx) {
      log.error(
        { err: wEx instanceof Error ? wEx.message : 'unknown' },
        'verify-hashes: cron_health_substrate failed',
      );
    }
    if (!substrateCronOk) {
      void dispatchOpsAlert("substrate-health cron is STALE (dead-man's-switch)", [
        'substrate-health has not recorded a check in >26h — the health alarm may be down.',
        'Runbook: docs/incident-runbook.md',
      ], { sms: true });
    }

    return NextResponse.json({
      ok: ok && anchorOk && substrateCronOk && failedCompanies.length === 0,
      chain_ok: ok,
      count_anchor_ok: anchorOk,
      substrate_cron_ok: substrateCronOk,
      failed_companies: failedCompanies,
      scan_started_at: scanStartedAt,
      scan_finished_at: scanFinishedAt,
      companies_scanned: companyIds.length,
      events_scanned: totalEvents,
      mismatches: allMismatches.length,
      anchor_violations: anchorViolations,
      per_company: perCompany,
      // Truncated mismatch preview so the HTTP response is bounded.
      mismatch_sample: allMismatches.slice(0, 10),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    // CRACK 236 observability — surface cron failures to Vercel ERROR logs.
    // This cron runs daily and is the primary chain-integrity alarm; a
    // silent 500 would mean a chain-corruption alert never lands.
    log.error({ err: message }, 'cron.verify_hashes.failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
