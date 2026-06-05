// Flostruction Intelligence — Analysis Service
// Called by POST /api/intelligence/analyse/[shiftId]
// Triggered by Supabase webhook on SHIFT_COMMIT event insert.
// NEVER blocks a submission. All analysis is informational.

import type { SupabaseClient } from '@supabase/supabase-js';
import { isWlesV1Enabled } from '@/lib/wles/flags';
import { sealEvent } from '@/lib/wles/v1';
import { buildIntelligenceClear, buildAnomalyFlag } from '@/lib/wles/v1-translate';
import {
  getV1ChainTail, insertV1Event, FLOSMOSIS_SYSTEM_ACTOR_ID,
} from '@/lib/wles/v1-chain';
import {
  runAllRules,
  computeConfidenceScore,
  isEligibleForBulkApproval,
  type AnomalyFlag,
  type ShiftForRules,
  type WorkerHistory,
} from './rules';
// L2.1 chunk 3 — collusion-detection rules. Rules 010 + 012
// evaluate at SHIFT_COMMIT analysis time. Rule 011 fires from the
// supervisor-approval path. Rule 013 is the cron-evaluated pair
// review.
import { checkRule010, checkRule012 } from './collusion-rules';

// ─────────────────────────────────────────────────────────────────────────────
// Haversine distance between two GPS coordinates (metres)
// ─────────────────────────────────────────────────────────────────────────────
function haversineMetres(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main analysis function
// ─────────────────────────────────────────────────────────────────────────────
export async function analyseShift(
  supabase: SupabaseClient,
  shiftId: string
): Promise<{
  shift_id: string;
  confidence_score: number;
  flags: AnomalyFlag[];
  cleared: boolean;
}> {
  // 1. Read shift record + worker
  const { data: shift, error: shiftError } = await supabase
    .from('shifts')
    .select(`
      id, company_id, worker_id, site_id, shift_date, start_time, end_time,
      break_minutes, total_hours, receipt_id, status, created_at,
      gps_lat, gps_lng, gps_accuracy_metres, worker_note
    `)
    .eq('id', shiftId)
    .single();

  if (shiftError || !shift) {
    throw new Error(`Shift not found: ${shiftId}`);
  }

  const { data: worker } = await supabase
    .from('workers')
    .select('id, first_name, last_name, pay_rate, company_id')
    .eq('id', shift.worker_id)
    .single();

  if (!worker) throw new Error(`Worker not found for shift ${shiftId}`);

  const { data: site } = await supabase
    .from('sites')
    .select('id, name, geofence_lat, geofence_lng, geofence_radius_metres')
    .eq('id', shift.site_id)
    .single();

  // 2. Worker's last 10 shifts for history
  const { data: historyShifts } = await supabase
    .from('shifts')
    .select('total_hours')
    .eq('worker_id', shift.worker_id)
    .neq('id', shiftId)
    .not('total_hours', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10);

  const history: WorkerHistory = {
    shifts: (historyShifts ?? []).map((s) => ({
      total_hours: parseFloat(s.total_hours ?? '0'),
    })),
  };

  // 3. Duplicate check (for RULE_004)
  const { count: duplicateCount } = await supabase
    .from('shifts')
    .select('id', { count: 'exact', head: true })
    .eq('worker_id', shift.worker_id)
    .eq('shift_date', shift.shift_date)
    .neq('id', shiftId)
    .not('status', 'in', '("DISPUTED")');

  // 4. GPS distance from site
  const geofenceRadius = site?.geofence_radius_metres ?? 200;
  let gpsDistanceFromSite: number | null = null;
  const gpsCaptured = shift.gps_lat !== null && shift.gps_lng !== null;

  if (
    gpsCaptured &&
    site?.geofence_lat &&
    site?.geofence_lng
  ) {
    gpsDistanceFromSite = haversineMetres(
      parseFloat(shift.gps_lat),
      parseFloat(shift.gps_lng),
      parseFloat(site.geofence_lat),
      parseFloat(site.geofence_lng)
    );
  }

  // 5. Build ShiftForRules
  const totalHours = parseFloat(shift.total_hours ?? '0');
  const shiftForRules: ShiftForRules = {
    id: shift.id,
    worker_first_name: worker.first_name,
    site_name: site?.name ?? 'this site',
    shift_date: shift.shift_date,
    start_time: new Date(shift.start_time),
    end_time: shift.end_time ? new Date(shift.end_time) : null,
    break_minutes: shift.break_minutes ?? 0,
    total_hours: totalHours,
    submitted_at: new Date(shift.created_at),
    gps_captured: gpsCaptured,
    gps_distance_from_site_metres: gpsDistanceFromSite,
    gps_accuracy_metres: shift.gps_accuracy_metres
      ? parseFloat(shift.gps_accuracy_metres)
      : null,
    worker_id: shift.worker_id,
    company_id: shift.company_id,
    site_id: shift.site_id,
  };

  // 6. Run all 7 rules
  const flags = runAllRules(
    shiftForRules,
    geofenceRadius,
    duplicateCount ?? 0,
    history
  );

  // 6a. L2.1 chunk 3 — collusion sync rules (010 + 012).
  // Rule 010 needs gps accuracy + mock_location; gps accuracy is
  // already on the shift row. mock_location is captured in the
  // worker's device metadata, which we read defensively here — if
  // the column doesn't exist yet, treat as "not reported".
  const rule010 = checkRule010({
    worker_first_name: worker.first_name,
    gps_accuracy_metres: shiftForRules.gps_accuracy_metres,
    mock_location_reported: false, // populated by future device-metadata work; defaults conservative
  });
  if (rule010.triggered && rule010.flag) flags.push(rule010.flag);

  // Rule 012: look for any OTHER sealed CLOCK_IN within the last
  // 30 minutes for this worker, at a different site, where the
  // distance between the two sites exceeds 5 km.
  const thirtyMinAgoIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: recentClockIns } = await supabase
    .from('shift_events')
    .select('site_id, created_at')
    .eq('worker_id', shift.worker_id)
    .eq('event_type', 'CLOCK_IN')
    .neq('site_id', shift.site_id)
    .gte('created_at', thirtyMinAgoIso)
    .order('created_at', { ascending: false })
    .limit(1);

  if (recentClockIns && recentClockIns.length > 0 && site?.geofence_lat && site?.geofence_lng) {
    const other = recentClockIns[0] as { site_id: string; created_at: string };
    const { data: otherSite } = await supabase
      .from('sites')
      .select('id, name, geofence_lat, geofence_lng')
      .eq('id', other.site_id)
      .single();
    if (otherSite?.geofence_lat && otherSite?.geofence_lng) {
      const distMetres = haversineMetres(
        parseFloat(site.geofence_lat),
        parseFloat(site.geofence_lng),
        parseFloat(otherSite.geofence_lat),
        parseFloat(otherSite.geofence_lng),
      );
      const distKm = distMetres / 1000;
      const minutesAgo = Math.round(
        (Date.now() - new Date(other.created_at).getTime()) / 60000,
      );
      const rule012 = checkRule012({
        worker_first_name: worker.first_name,
        current_site_name: site.name,
        conflicting:
          distKm > 5
            ? {
                site_name: otherSite.name,
                distance_km: distKm,
                minutes_ago: minutesAgo,
              }
            : null,
      });
      if (rule012.triggered && rule012.flag) flags.push(rule012.flag);
    }
  }

  // 7. Confidence score
  const historyAvgHours =
    history.shifts.length > 0
      ? history.shifts.reduce((sum, s) => sum + s.total_hours, 0) / history.shifts.length
      : null;

  const confidenceScore = computeConfidenceScore({
    gps_captured: gpsCaptured,
    gps_distance_from_site_metres: gpsDistanceFromSite,
    geofence_radius_metres: geofenceRadius,
    total_hours: totalHours,
    end_time: shift.end_time ? new Date(shift.end_time) : null,
    break_minutes: shift.break_minutes,
    history_shift_count: history.shifts.length,
    history_avg_hours: historyAvgHours,
  });

  const cleared = isEligibleForBulkApproval(flags);

  // 8. Persist confidence_score + anomaly_flags to shifts table
  await supabase
    .from('shifts')
    .update({
      confidence_score: confidenceScore,
      anomaly_flags: flags,
      updated_at: new Date().toISOString(),
    })
    .eq('id', shiftId);

  // 9. Write WLES events (server-side only — uses service role)
  const now = new Date();

  // Fail-closed + company_id assertion. Intelligence is the only
  // non-human writer of shift_events; M0 blocks any post-cutover v0
  // insert at the substrate, so silent fallback would constraint-fail.
  if (!isWlesV1Enabled()) {
    throw new Error('intelligence.analyse: WLES_V1_ENABLED must be set; v0 writes are blocked at the substrate post-cutover.');
  }
  if (!shift.company_id) {
    throw new Error(`intelligence.analyse: company_id is required for v1 sealing (shift ${shiftId})`);
  }

  const highMediumFlags = flags.filter(
    (f) => f.severity === 'HIGH' || f.severity === 'MEDIUM'
  );

  if (cleared) {
    const eventData = {
      shift_id: shiftId,
      receipt_id: shift.receipt_id,
      confidence_score: confidenceScore,
      rules_checked: 7,
      flags_found: 0,
    };
    const previousEventHash = await getV1ChainTail(
      supabase as unknown as Parameters<typeof getV1ChainTail>[0],
      shift.company_id,
    );
    const unsealed = buildIntelligenceClear({
      actorId: FLOSMOSIS_SYSTEM_ACTOR_ID,
      subjectId: shift.worker_id,
      timestamp: now.toISOString(),
      previousEventHash,
      shiftId,
      checksPerformed: [
        'over_max_hours', 'simultaneous_shift_pair', 'rate_change_flag',
        'after_midnight_clockout', 'duplicate_receipt', 'geofence_distance',
        'manual_clockin_attestation',
      ],
      checkVersion: 'v1.0',
    });
    const sealed = sealEvent(unsealed);
    await insertV1Event(
      supabase as unknown as Parameters<typeof insertV1Event>[0],
      sealed,
      {
        companyId: shift.company_id,
        workerId: shift.worker_id,
        siteId: shift.site_id ?? null,
        createdBy: 'flostruction-intelligence',
        eventDataCompat: eventData,
      },
    );
  } else {
    // One ANOMALY_FLAG event per HIGH/MEDIUM flag, chained sequentially.
    let chainTail = await getV1ChainTail(
      supabase as unknown as Parameters<typeof getV1ChainTail>[0],
      shift.company_id,
    );
    for (let i = 0; i < highMediumFlags.length; i++) {
      const flag = highMediumFlags[i];
      const eventCreatedAt = new Date(now.getTime() + i);
      const eventData = {
        shift_id: shiftId,
        receipt_id: shift.receipt_id,
        rule_id: flag.ruleId,
        severity: flag.severity,
        explanation: flag.explanation,
        suggested_action: flag.action,
        confidence_score: confidenceScore,
      };
      const unsealed = buildAnomalyFlag({
        actorId: FLOSMOSIS_SYSTEM_ACTOR_ID,
        subjectId: shift.worker_id,
        timestamp: eventCreatedAt.toISOString(),
        previousEventHash: chainTail,
        shiftId,
        anomalyType: flag.ruleId,
        severity: flag.severity === 'HIGH' ? 'high' : flag.severity === 'MEDIUM' ? 'medium' : 'low',
        details: flag.explanation,
      });
      const sealed = sealEvent(unsealed);
      await insertV1Event(
        supabase as unknown as Parameters<typeof insertV1Event>[0],
        sealed,
        {
          companyId: shift.company_id,
          workerId: shift.worker_id,
          siteId: shift.site_id ?? null,
          createdBy: 'flostruction-intelligence',
          eventDataCompat: eventData,
        },
      );
      chainTail = sealed.event_hash;
    }
  }

  return { shift_id: shiftId, confidence_score: confidenceScore, flags, cleared };
}
