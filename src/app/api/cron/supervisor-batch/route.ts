// Flostruction — Supervisor Batch SMS Cron
// POST /api/cron/supervisor-batch
// Vercel cron: 30 6 * * 1-5 (4:30pm AEST = 06:30 UTC on weekdays)
// Sends one batch SMS per active supervisor per day with pending shifts.
// Non-negotiable: no more than one batch SMS per supervisor per calendar day.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getTwilioClient, getTwilioFromNumber } from '@/lib/twilio/client';
import { composeBatchSMS, extractCode, type ShiftForSMS } from '@/lib/sms/compose';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/security/rate-limit';
import type { AnomalyFlag } from '@/lib/intelligence/rules';

import { routeLogger } from '@/lib/logger';
// CREDENTIAL REQUIRED: CRON_SECRET
// CREDENTIAL REQUIRED: TWILIO_ACCOUNT_SID
// CREDENTIAL REQUIRED: TWILIO_AUTH_TOKEN
// CREDENTIAL REQUIRED: TWILIO_FROM_NUMBER

interface SupervisorRow {
  id: string;
  company_id: string;
  name: string;
  phone: string;
  site_ids: string[] | null;
  is_active: boolean;
  pending_sms_approval_ids: string[] | null;
  last_batch_sms_date: string | null;
  verify_token: string;
}

interface ShiftRow {
  id: string;
  company_id: string;
  worker_id: string;
  site_id: string;
  shift_date: string;
  start_time: string;
  end_time: string | null;
  break_minutes: number;
  total_hours: string | null;
  receipt_id: string;
  status: string;
  anomaly_flags: AnomalyFlag[] | null;
}

interface WorkerRow {
  id: string;
  first_name: string;
  last_name: string;
}

interface SiteRow {
  id: string;
  name: string;
}

export async function POST(request: Request) {
  const log = routeLogger('POST /api/cron/supervisor-batch', request.headers.get('x-request-id'));
  log.info({ method: 'POST' }, 'request.received');
  // Security: verify CRON_SECRET
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit check
  const clientIP = getClientIP(request);
  const rl = checkRateLimit(`cron:${clientIP}`, RATE_LIMITS.API);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const supabase = createServiceClient();
  const results: Array<{ supervisor: string; status: string; shiftCount: number }> = [];

  try {
    // Get today's date in AEST (UTC+10)
    const nowUTC = new Date();
    const aestOffset = 10 * 60 * 60 * 1000;
    const nowAEST = new Date(nowUTC.getTime() + aestOffset);
    const todayAEST = nowAEST.toISOString().split('T')[0];

    // Fetch all active supervisors
    const { data: supervisors, error: supError } = await supabase
      .from('supervisors')
      .select('id, company_id, name, phone, site_ids, is_active, pending_sms_approval_ids, last_batch_sms_date, verify_token')
      .eq('is_active', true);

    if (supError) throw new Error(`Failed to fetch supervisors: ${supError.message}`);
    if (!supervisors || supervisors.length === 0) {
      return NextResponse.json({ status: 'no_active_supervisors', sent: 0 });
    }

    const twilioClient = getTwilioClient();
    const fromNumber = getTwilioFromNumber();

    for (const supervisor of supervisors as SupervisorRow[]) {
      // Skip if no site_ids assigned
      if (!supervisor.site_ids || supervisor.site_ids.length === 0) {
        results.push({ supervisor: supervisor.name, status: 'no_sites', shiftCount: 0 });
        continue;
      }

      // Skip if already sent today (non-negotiable: one batch per day)
      if (supervisor.last_batch_sms_date === todayAEST) {
        results.push({ supervisor: supervisor.name, status: 'already_sent_today', shiftCount: 0 });
        continue;
      }

      // Fetch SUBMITTED shifts for this supervisor's sites
      const { data: shiftRows, error: shiftError } = await supabase
        .from('shifts')
        .select('id, company_id, worker_id, site_id, shift_date, start_time, end_time, break_minutes, total_hours, receipt_id, status, anomaly_flags')
        .in('site_id', supervisor.site_ids)
        .eq('status', 'SUBMITTED')
        .order('shift_date', { ascending: true });

      if (shiftError) {
        results.push({ supervisor: supervisor.name, status: `error: ${shiftError.message}`, shiftCount: 0 });
        continue;
      }

      if (!shiftRows || shiftRows.length === 0) {
        results.push({ supervisor: supervisor.name, status: 'no_pending_shifts', shiftCount: 0 });
        continue;
      }

      // Collect worker IDs and site IDs for lookup
      const workerIds = [...new Set(shiftRows.map((s: ShiftRow) => s.worker_id))];
      const siteIds = [...new Set(shiftRows.map((s: ShiftRow) => s.site_id))];

      const { data: workers } = await supabase
        .from('workers')
        .select('id, first_name, last_name')
        .in('id', workerIds);

      const { data: sites } = await supabase
        .from('sites')
        .select('id, name')
        .in('id', siteIds);

      const workerMap = new Map((workers as WorkerRow[] ?? []).map((w) => [w.id, w]));
      const siteMap = new Map((sites as SiteRow[] ?? []).map((s) => [s.id, s]));

      // Build ShiftForSMS array
      const shiftsForSMS: ShiftForSMS[] = (shiftRows as ShiftRow[]).map((shift) => {
        const worker = workerMap.get(shift.worker_id);
        const site = siteMap.get(shift.site_id);
        return {
          receiptId: shift.receipt_id,
          workerFirstName: worker?.first_name ?? 'Unknown',
          workerLastName: worker?.last_name ?? '',
          totalHours: parseFloat(shift.total_hours ?? '0'),
          siteName: site?.name ?? 'Unknown site',
          anomalyFlags: (shift.anomaly_flags ?? []) as AnomalyFlag[],
        };
      });

      // Compose batch SMS
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://flosmosis.com';
      const backupUrl = `${appUrl}/v/${supervisor.verify_token}`;
      const message = composeBatchSMS({ shifts: shiftsForSMS, backupUrl });

      // Send via Twilio
      await twilioClient.messages.create({
        to: supervisor.phone,
        from: fromNumber,
        body: message,
      });

      // Store 6-char codes in pending_sms_approval_ids
      const codes = (shiftRows as ShiftRow[]).map((s) => extractCode(s.receipt_id));

      // Update supervisor record. last_batch_sms_sent_at is the
      // second-precision timestamp used by RULE_011
      // (RUBBER_STAMP_RISK) to compute supervisor reply latency.
      await supabase
        .from('supervisors')
        .update({
          pending_sms_approval_ids: codes,
          last_batch_sms_date: todayAEST,
          last_batch_sms_sent_at: new Date().toISOString(),
        })
        .eq('id', supervisor.id);

      results.push({
        supervisor: supervisor.name,
        status: 'sent',
        shiftCount: shiftRows.length,
      });
    }

    return NextResponse.json({
      status: 'complete',
      date: todayAEST,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
