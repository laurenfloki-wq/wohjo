// ---------------------------------------------------------------
// FLOS-SHA-001 / W3-SG-4 — /api/cron/substrate-health
// Daily substrate-anchor verification (M3). Reads
// v_anchor_verification — the view recomputes each anchor's
// fingerprint INLINE in its own DDL (the forcing function: anchors
// cannot be added or altered by data-only writes) — and records the
// outcome in substrate_health_log (check_name 'anchor_fingerprint').
//
// Status mapping (per the M3 migration contract):
//   every anchor matches=true            → GREEN
//   any anchor matches=false             → RED   (+ alert rows)
//   any anchor matches IS NULL           → ERROR (anchor without an
//     inline formula in the view DDL — a code-change gap, not data
//     tampering; surfaced loudly so it can never sit silent)
//
// Pure detection path. Never mutates substrate_anchors or
// shift_events. Companion to /api/cron/verify-hashes (dual-mode
// chain verification), which records chain_integrity_shift_events
// into the same log. Email/Sentry escalation lands in W5 — the RED
// alert row in admin_access_log is the durable record today.
// ---------------------------------------------------------------

import { NextResponse } from 'next/server';
// W3 (2026-06-11): SYSTEM surface — cross-company BY DESIGN
// (CRON_SECRET-gated cron schedule, sessionless).
import { getServiceClientForSystemJob } from '@/lib/db/service-client';
import { routeLogger } from '@/lib/logger';
// Phase 3 / OBS-2: human ping when any check goes RED — fans out across
// email + SMS (out-of-band) + Slack, so no single channel outage silences it.
// The durable records (alert rows + health log) are written first, below.
import { dispatchOpsAlert } from '@/lib/observability/ops-alert';
// WLES-6 — a shift past IN_PROGRESS must carry a sealed SHIFT_COMMIT.
import { nonBaselineOrphans, type OrphanShift } from '@/lib/wles/shift-commit-completeness';

const SYSTEM_USER_UUID = '00000000-0000-0000-0000-000000000000';

interface AnchorRow {
  id: string;
  scope_text: string;
  expected_fingerprint: string;
  expected_count: number;
  bound_at: string;
  actual_fingerprint: string | null;
  actual_count: number | null;
  matches: boolean | null;
  recomputed_at: string;
}

export async function GET(request: Request) {
  const log = routeLogger('GET /api/cron/substrate-health', request.headers.get('x-request-id'));
  log.info({ method: 'GET' }, 'request.received');

  // Auth — Vercel-canonical Authorization: Bearer pattern (standardised
  // across all cron routes 2026-04-29 per substrate-DD audit).
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const runStartIso = new Date(startedAt).toISOString();
  const supabase = getServiceClientForSystemJob();

  try {
    const { data, error } = await supabase.from('v_anchor_verification').select('*');
    if (error) throw new Error(`v_anchor_verification: ${error.message}`);
    const anchors = (data ?? []) as AnchorRow[];

    const mismatched = anchors.filter((a) => a.matches === false);
    const unverifiable = anchors.filter((a) => a.matches === null);
    const status =
      anchors.length === 0
        ? 'ERROR' // zero anchors would itself be a substrate regression
        : mismatched.length > 0
          ? 'RED'
          : unverifiable.length > 0
            ? 'ERROR'
            : 'GREEN';

    // Order matters: durable alert rows first, then the health record.
    if (mismatched.length > 0 || unverifiable.length > 0) {
      const alertRows = [...mismatched, ...unverifiable].map((a) => ({
        admin_user_id: SYSTEM_USER_UUID,
        customer_id_accessed: null,
        resource_type: 'substrate_anchors',
        resource_id: null, // anchor ids are text; carried in reason_code
        action: 'alert',
        reason_code:
          a.matches === false ? `ANCHOR_MISMATCH:${a.id}` : `ANCHOR_UNVERIFIABLE:${a.id}`,
        source_ip: null,
      }));
      const { error: alertErr } = await supabase.from('admin_access_log').insert(alertRows);
      if (alertErr) throw new Error(`alert rows: ${alertErr.message}`);
      log.error(
        { mismatched: mismatched.map((a) => a.id), unverifiable: unverifiable.map((a) => a.id) },
        'substrate_health.anchor_alert',
      );
    }

    const { error: healthErr } = await supabase.from('substrate_health_log').insert({
      check_name: 'anchor_fingerprint',
      status,
      detail: {
        anchors: anchors.map((a) => ({
          id: a.id,
          matches: a.matches,
          actual_fingerprint: a.actual_fingerprint,
          actual_count: a.actual_count,
          recomputed_at: a.recomputed_at,
        })),
        mismatched: mismatched.map((a) => a.id),
        unverifiable: unverifiable.map((a) => a.id),
      },
      baseline: {
        anchors: anchors.map((a) => ({
          id: a.id,
          expected_fingerprint: a.expected_fingerprint,
          expected_count: a.expected_count,
          bound_at: a.bound_at,
        })),
      },
      duration_ms: Date.now() - startedAt,
    });
    if (healthErr) throw new Error(`substrate_health_log: ${healthErr.message}`);

    log.info({ status, anchors: anchors.length }, 'substrate_health.anchor_check_recorded');

    // ── W4/SG-5 — webhook_delivery_twilio dead-letter check ─────────
    // Unprocessed Twilio deliveries older than one hour have outlived
    // Twilio's retry window. Each row still holds the full form
    // payload (replayable), but it needs an operator decision — RED.
    const dlCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: deadLetters, error: dlErr } = await supabase
      .from('webhook_idempotency')
      .select('key, route, first_seen_at')
      .eq('source', 'twilio')
      .is('processed_at', null)
      .lt('first_seen_at', dlCutoff)
      .limit(20);
    if (dlErr) throw new Error(`webhook_idempotency: ${dlErr.message}`);
    const dlRows = deadLetters ?? [];
    const dlStatus = dlRows.length > 0 ? 'RED' : 'GREEN';
    const { error: dlHealthErr } = await supabase.from('substrate_health_log').insert({
      check_name: 'webhook_delivery_twilio',
      status: dlStatus,
      detail: { dead_letters: dlRows, cutoff: dlCutoff },
      baseline: null,
      duration_ms: Date.now() - startedAt,
    });
    if (dlHealthErr) throw new Error(`substrate_health_log (twilio): ${dlHealthErr.message}`);
    if (dlStatus === 'RED') {
      log.error(
        { deadLetters: dlRows.map((d: { key: string }) => d.key) },
        'substrate_health.twilio_dead_letters',
      );
    }

    // ── W5/SG-6 — webhook_delivery_stripe dead-letter check ─────────
    // Same contract as the Twilio check: an unprocessed stripe_event_log
    // row older than one hour means Stripe's retries exhausted against a
    // failing handler — the event is durable but needs an operator.
    const { data: stripeDl, error: sdlErr } = await supabase
      .from('stripe_event_log')
      .select('event_id, event_type, received_at')
      .is('processed_at', null)
      .lt('received_at', dlCutoff)
      .limit(20);
    if (sdlErr) throw new Error(`stripe_event_log: ${sdlErr.message}`);
    const stripeRows = stripeDl ?? [];
    const stripeStatus = stripeRows.length > 0 ? 'RED' : 'GREEN';
    const { error: sHealthErr } = await supabase.from('substrate_health_log').insert({
      check_name: 'webhook_delivery_stripe',
      status: stripeStatus,
      detail: { dead_letters: stripeRows, cutoff: dlCutoff },
      baseline: null,
      duration_ms: Date.now() - startedAt,
    });
    if (sHealthErr) throw new Error(`substrate_health_log (stripe): ${sHealthErr.message}`);

    // ── B4/SG-5 — notification_outbound dead-letter check ───────────
    // Outbound sends (worker SMS, Resend email) have no provider retry
    // window — a dead letter is immediately operator-actionable. RED
    // while any unreplayed row exists. Guarded: if the table is not yet
    // migrated, this check degrades to ERROR without failing the run.
    let notifStatus: 'GREEN' | 'RED' | 'ERROR' = 'GREEN';
    let notifRows: Array<{ id: string; channel: string; created_at: string }> = [];
    let notifDetail: Record<string, unknown>;
    const { data: notifDl, error: notifErr } = await supabase
      .from('notification_dead_letter')
      .select('id, channel, created_at')
      .is('replayed_at', null)
      .limit(20);
    if (notifErr) {
      notifStatus = 'ERROR';
      notifDetail = { error: notifErr.message };
      log.error({ err: notifErr.message }, 'substrate_health.notification_outbound_unreadable');
    } else {
      notifRows = (notifDl ?? []) as Array<{ id: string; channel: string; created_at: string }>;
      notifStatus = notifRows.length > 0 ? 'RED' : 'GREEN';
      notifDetail = { dead_letters: notifRows };
    }
    const { error: nHealthErr } = await supabase.from('substrate_health_log').insert({
      check_name: 'notification_outbound',
      status: notifStatus,
      detail: notifDetail,
      baseline: null,
      duration_ms: Date.now() - startedAt,
    });
    // B4b (2026-06-13): never throw here. On 12 Jun the check_name CHECK
    // constraint didn't yet include 'notification_outbound'; the insert
    // failed, the throw 500'd the run, and cron_health was silenced —
    // one broken check must not take the alarm pipeline down with it.
    if (nHealthErr) {
      notifStatus = 'ERROR';
      log.error(
        { err: nHealthErr.message },
        'substrate_health.notification_outbound_record_failed',
      );
    }
    if (notifStatus === 'RED') {
      log.error(
        { deadLetters: notifRows.map((d) => d.id) },
        'substrate_health.notification_dead_letters',
      );
    }

    // \u2500\u2500 B5/SG-6 \u2014 webhook_delivery_supabase_auth dead-letter check \u2500\u2500
    // Third webhook source, same contract as Twilio/Stripe: an unprocessed
    // supabase-auth delivery older than one hour has outlived its retry
    // window. None exist today (no auth webhooks received yet) so this is
    // GREEN until the surface goes live \u2014 wired now so the alarm predates
    // the first real delivery rather than chasing it.
    let authStatus: 'GREEN' | 'RED' | 'ERROR' = 'GREEN';
    let authRows: Array<{ key: string; route: string; first_seen_at: string }> = [];
    let authDetail: Record<string, unknown>;
    const { data: authDl, error: authErr } = await supabase
      .from('webhook_idempotency')
      .select('key, route, first_seen_at')
      .eq('source', 'supabase-auth')
      .is('processed_at', null)
      .lt('first_seen_at', dlCutoff)
      .limit(20);
    if (authErr) {
      authStatus = 'ERROR';
      authDetail = { error: authErr.message };
      log.error({ err: authErr.message }, 'substrate_health.supabase_auth_unreadable');
    } else {
      authRows = (authDl ?? []) as Array<{ key: string; route: string; first_seen_at: string }>;
      authStatus = authRows.length > 0 ? 'RED' : 'GREEN';
      authDetail = { dead_letters: authRows, cutoff: dlCutoff };
    }
    const { error: authHealthErr } = await supabase.from('substrate_health_log').insert({
      check_name: 'webhook_delivery_supabase_auth',
      status: authStatus,
      detail: authDetail,
      baseline: null,
      duration_ms: Date.now() - startedAt,
    });
    if (authHealthErr) {
      authStatus = 'ERROR';
      log.error({ err: authHealthErr.message }, 'substrate_health.supabase_auth_record_failed');
    }
    if (authStatus === 'RED') {
      log.error(
        { deadLetters: authRows.map((d) => d.key) },
        'substrate_health.supabase_auth_dead_letters',
      );
    }

    // \u2500\u2500 B5/SG-6 \u2014 advisor_sweep structural-security invariants \u2500\u2500
    // Continuous in-substrate assertion of two invariants the Supabase
    // security advisor enforces and the substrate has committed to:
    //   (1) every public table has RLS enabled
    //   (2) every public SECURITY DEFINER function pins search_path
    // Exposed via v_security_advisor_sweep (a security_invoker view over
    // pg_catalog, service-role only). Any returned row is a real structural
    // regression \u2192 RED. This is the SQL-observable subset of the managed
    // advisor; auth-config items (leaked-password protection, etc.) are not
    // SQL-observable and remain a founder/console responsibility.
    let advisorStatus: 'GREEN' | 'RED' | 'ERROR' = 'GREEN';
    let advisorRows: Array<{ finding: string; object_name: string }> = [];
    let advisorDetail: Record<string, unknown>;
    const { data: advisorData, error: advisorErr } = await supabase
      .from('v_security_advisor_sweep')
      .select('finding, object_name')
      .limit(100);
    if (advisorErr) {
      advisorStatus = 'ERROR';
      advisorDetail = { error: advisorErr.message };
      log.error({ err: advisorErr.message }, 'substrate_health.advisor_sweep_unreadable');
    } else {
      advisorRows = (advisorData ?? []) as Array<{ finding: string; object_name: string }>;
      advisorStatus = advisorRows.length > 0 ? 'RED' : 'GREEN';
      advisorDetail = { findings: advisorRows };
    }
    const { error: advisorHealthErr } = await supabase.from('substrate_health_log').insert({
      check_name: 'advisor_sweep',
      status: advisorStatus,
      detail: advisorDetail,
      baseline: null,
      duration_ms: Date.now() - startedAt,
    });
    if (advisorHealthErr) {
      advisorStatus = 'ERROR';
      log.error({ err: advisorHealthErr.message }, 'substrate_health.advisor_sweep_record_failed');
    }
    if (advisorStatus === 'RED') {
      log.error({ findings: advisorRows }, 'substrate_health.advisor_sweep_findings');
    }

    // \u2500\u2500 B5/SG-6 \u2014 error_rate: substrate self-monitoring rollup \u2500\u2500
    // Aggregates the trailing 24h of health outcomes from PRIOR runs only
    // (run_at < this run's start, so it never reads its own rows). RED if
    // any check could not evaluate (ERROR class) or if a majority of recent
    // outcomes were non-GREEN \u2014 a systemic signal the per-check alarms do
    // not raise individually. Degrades to ERROR if the log is unreadable.
    let errStatus: 'GREEN' | 'RED' | 'ERROR' = 'GREEN';
    let errDetail: Record<string, unknown>;
    const erWindow = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: erData, error: erErr } = await supabase
      .from('substrate_health_log')
      .select('status')
      .gte('run_at', erWindow)
      .lt('run_at', runStartIso)
      .limit(1000);
    if (erErr) {
      errStatus = 'ERROR';
      errDetail = { error: erErr.message };
      log.error({ err: erErr.message }, 'substrate_health.error_rate_unreadable');
    } else {
      const rows = (erData ?? []) as Array<{ status: string }>;
      const total = rows.length;
      const green = rows.filter((r) => r.status === 'GREEN').length;
      const errc = rows.filter((r) => r.status === 'ERROR').length;
      const red = total - green - errc;
      const ratioNonGreen = total > 0 ? (total - green) / total : 0;
      errStatus = errc > 0 || ratioNonGreen > 0.5 ? 'RED' : 'GREEN';
      errDetail = {
        window_hours: 24,
        total,
        green,
        red,
        error: errc,
        ratio_non_green: Number(ratioNonGreen.toFixed(3)),
      };
    }
    const { error: erHealthErr } = await supabase.from('substrate_health_log').insert({
      check_name: 'error_rate',
      status: errStatus,
      detail: errDetail,
      baseline: null,
      duration_ms: Date.now() - startedAt,
    });
    if (erHealthErr) {
      errStatus = 'ERROR';
      log.error({ err: erHealthErr.message }, 'substrate_health.error_rate_record_failed');
    }
    if (errStatus === 'RED') {
      log.error({ detail: errDetail }, 'substrate_health.error_rate_high');
    }

    // ── W5/SG-6 — cron_health: the alarm checks its own pulse ───────
    // verify-hashes (daily, 15 minutes before this run) must have
    // recorded a chain_integrity_shift_events outcome within 26 hours;
    // a stale or missing row means the chain alarm itself is not
    // running — RED regardless of what the chain would have said.
    const { data: lastChain, error: chErr } = await supabase
      .from('substrate_health_log')
      .select('run_at, status')
      .eq('check_name', 'chain_integrity_shift_events')
      .order('run_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (chErr) throw new Error(`substrate_health_log (cron read): ${chErr.message}`);
    const chainRow = lastChain as { run_at: string; status: string } | null;
    const chainFresh =
      chainRow !== null && Date.parse(chainRow.run_at) > Date.now() - 26 * 60 * 60 * 1000;
    const cronStatus = chainFresh ? 'GREEN' : 'RED';
    const { error: cHealthErr } = await supabase.from('substrate_health_log').insert({
      check_name: 'cron_health',
      status: cronStatus,
      detail: {
        watched: 'chain_integrity_shift_events',
        last_run_at: chainRow?.run_at ?? null,
        last_status: chainRow?.status ?? null,
      },
      baseline: null,
      duration_ms: Date.now() - startedAt,
    });
    if (cHealthErr) throw new Error(`substrate_health_log (cron): ${cHealthErr.message}`);

    // ── WLES-6 — shift_commit_completeness ──────────────────────────
    // Any shift in the approvable/payable window (SUBMITTED /
    // SUPERVISOR_APPROVED / PAYROLL_APPROVED) that lacks a sealed
    // SHIFT_COMMIT is approvable/payable without its commit attestation —
    // the silent degraded-200 gap in /api/field/shift/end. The view
    // surfaces candidates; a documented seed-data baseline is excluded.
    let commitStatus: 'GREEN' | 'RED' | 'ERROR' = 'GREEN';
    let commitOrphans: OrphanShift[] = [];
    let commitDetail: Record<string, unknown>;
    const { data: commitData, error: commitErr } = await supabase
      .from('v_shift_commit_orphans')
      .select('shift_id, status')
      .limit(100);
    if (commitErr) {
      commitStatus = 'ERROR';
      commitDetail = { error: commitErr.message };
      log.error({ err: commitErr.message }, 'substrate_health.shift_commit_unreadable');
    } else {
      commitOrphans = nonBaselineOrphans((commitData ?? []) as OrphanShift[]);
      commitStatus = commitOrphans.length > 0 ? 'RED' : 'GREEN';
      commitDetail = { orphans: commitOrphans.slice(0, 50) };
    }
    const { error: commitHealthErr } = await supabase.from('substrate_health_log').insert({
      check_name: 'shift_commit_completeness',
      status: commitStatus,
      detail: commitDetail,
      baseline: null,
      duration_ms: Date.now() - startedAt,
    });
    if (commitHealthErr) {
      commitStatus = 'ERROR';
      log.error({ err: commitHealthErr.message }, 'substrate_health.shift_commit_record_failed');
    }
    if (commitStatus === 'RED') {
      // Durable alert rows — one per orphan shift — then the human ping below.
      const rows = commitOrphans.map((o) => ({
        admin_user_id: SYSTEM_USER_UUID,
        customer_id_accessed: null,
        resource_type: 'shifts',
        resource_id: o.shift_id,
        action: 'alert',
        reason_code: `SHIFT_COMMIT_MISSING:${o.status}`,
        source_ip: null,
      }));
      const { error: commitAlertErr } = await supabase.from('admin_access_log').insert(rows);
      if (commitAlertErr) {
        log.error({ err: commitAlertErr.message }, 'substrate_health.shift_commit_alert_failed');
      }
      log.error({ orphans: commitOrphans }, 'substrate_health.shift_commit_orphans');
    }

    // ── W5/SG-6 — human ping on any non-GREEN (best-effort) ─────────
    const redLines: string[] = [];
    if (status !== 'GREEN') redLines.push(`anchor_fingerprint: ${status}`);
    if (dlStatus !== 'GREEN')
      redLines.push(`webhook_delivery_twilio: ${dlStatus} (${dlRows.length} dead letters)`);
    if (stripeStatus !== 'GREEN')
      redLines.push(`webhook_delivery_stripe: ${stripeStatus} (${stripeRows.length} dead letters)`);
    if (cronStatus !== 'GREEN') redLines.push(`cron_health: ${cronStatus} (chain alarm stale)`);
    if (notifStatus !== 'GREEN')
      redLines.push(`notification_outbound: ${notifStatus} (${notifRows.length} dead letters)`);
    if (authStatus !== 'GREEN')
      redLines.push(
        `webhook_delivery_supabase_auth: ${authStatus} (${authRows.length} dead letters)`,
      );
    if (advisorStatus !== 'GREEN')
      redLines.push(`advisor_sweep: ${advisorStatus} (${advisorRows.length} findings)`);
    if (errStatus !== 'GREEN') redLines.push(`error_rate: ${errStatus}`);
    if (commitStatus !== 'GREEN')
      redLines.push(
        `shift_commit_completeness: ${commitStatus} (${commitOrphans.length} shift(s) missing SHIFT_COMMIT)`,
      );
    if (redLines.length > 0) {
      redLines.push('Runbook: docs/incident-runbook.md');
      // Substrate health RED is critical → also fire the out-of-band SMS.
      void dispatchOpsAlert('FLOS-SHA-001 substrate health RED', redLines, { sms: true });
    }

    return NextResponse.json({
      ok:
        status === 'GREEN' &&
        dlStatus === 'GREEN' &&
        stripeStatus === 'GREEN' &&
        cronStatus === 'GREEN' &&
        notifStatus !== 'RED' &&
        authStatus !== 'RED' &&
        advisorStatus !== 'RED' &&
        errStatus !== 'RED' &&
        commitStatus !== 'RED',
      status,
      anchors_checked: anchors.length,
      mismatched: mismatched.map((a) => a.id),
      unverifiable: unverifiable.map((a) => a.id),
      webhook_delivery_twilio: dlStatus,
      dead_letters: dlRows.length,
      webhook_delivery_stripe: stripeStatus,
      stripe_dead_letters: stripeRows.length,
      cron_health: cronStatus,
      notification_outbound: notifStatus,
      notification_dead_letters: notifRows.length,
      webhook_delivery_supabase_auth: authStatus,
      supabase_auth_dead_letters: authRows.length,
      advisor_sweep: advisorStatus,
      advisor_findings: advisorRows.length,
      error_rate: errStatus,
      shift_commit_completeness: commitStatus,
      shift_commit_orphans: commitOrphans.length,
      duration_ms: Date.now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    // The anchor check is a primary tamper-evidence alarm; a silent
    // 500 would mean a RED never lands. Surface to Vercel ERROR logs.
    log.error({ err: message }, 'cron.substrate_health.failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
