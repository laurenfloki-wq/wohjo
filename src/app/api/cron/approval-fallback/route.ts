// Sprint 6 — Task 9 — Approval fallback email cron
// Runs every 15 minutes via Vercel cron (see vercel.json).
// For shifts pending supervisor approval > 90 minutes, emails the
// supervisor (if an email address is on file) with a single-use
// approval token link.
//
// Requires two migration additions (see Task9_EmailFallback_Gate.txt):
//   ALTER TABLE shifts ADD COLUMN IF NOT EXISTS fallback_email_sent boolean NOT NULL DEFAULT false;
//   ALTER TABLE shifts ADD COLUMN IF NOT EXISTS fallback_email_sent_at timestamptz;
//   CREATE TABLE shift_approval_tokens (...);
//
// Secured by CRON_SECRET.

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/server';
import { getResend } from '@/lib/email/notify';

import { routeLogger } from '@/lib/logger';
export const runtime = 'nodejs';

interface PendingShiftRow {
  id: string;
  supervisor_id: string | null;
  total_hours: string | null;
  start_time_source: string | null;
  worker_confirmed_start_at: string | null;
  geofence_detected_at: string | null;
  start_time: string | null;
  created_at: string;
  workers: { first_name: string | null } | null;
  sites: { name: string | null } | null;
}

interface SupervisorRow {
  id: string;
  email: string | null;
  first_name: string | null;
}

function buildEmailBody(
  supervisorName: string,
  shifts: PendingShiftRow[],
  approvalUrl: string,
): string {
  const workerList = shifts
    .map((s) => {
      const name = s.workers?.first_name ?? 'Worker';
      const hours = s.total_hours ?? '0';
      const src = s.start_time_source ?? 'MANUAL';
      return `  - ${name} — ${hours}h (source: ${src})`;
    })
    .join('\n');

  return [
    `${supervisorName},`,
    '',
    `${shifts.length} worker${shifts.length === 1 ? ' is' : 's are'} waiting for your shift approval.`,
    '',
    workerList,
    '',
    'To approve all, follow this link:',
    `  ${approvalUrl}`,
    '',
    'This link closes automatically in 24 hours.',
    '',
    'FLOSTRUCTION',
    'Both sides agreed. Permanently.',
  ].join('\n');
}

export async function GET(request: Request) {
  const log = routeLogger('GET /api/cron/approval-fallback', request.headers.get('x-request-id'));
  log.info({ method: 'GET' }, 'request.received');
  const secret = request.headers.get('authorization') ?? `Bearer ${new URL(request.url).searchParams.get('secret') ?? ''}`;
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!process.env.CRON_SECRET || secret !== expected) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const ninetyMinAgo = new Date(Date.now() - 90 * 60 * 1000).toISOString();

    const { data: overdue, error: overdueErr } = await supabase
      .from('shifts')
      .select(`
        id,
        supervisor_id,
        total_hours,
        start_time_source,
        worker_confirmed_start_at,
        geofence_detected_at,
        start_time,
        created_at,
        workers (first_name),
        sites (name)
      `)
      .eq('status', 'PENDING_APPROVAL')
      .eq('fallback_email_sent', false)
      .lt('created_at', ninetyMinAgo);

    if (overdueErr) throw overdueErr;

    const shifts = (overdue ?? []) as unknown as PendingShiftRow[];
    if (shifts.length === 0) return NextResponse.json({ sent: 0, shifts: 0 });

    // Group shifts by supervisor
    const bySupervisor = new Map<string, PendingShiftRow[]>();
    for (const s of shifts) {
      if (!s.supervisor_id) continue;
      const arr = bySupervisor.get(s.supervisor_id) ?? [];
      arr.push(s);
      bySupervisor.set(s.supervisor_id, arr);
    }

    const resend = getResend();
    let sentCount = 0;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://flosmosis.com';

    for (const [supervisorId, supShifts] of bySupervisor) {
      const { data: supData } = await supabase
        .from('supervisors')
        .select('id, email, first_name')
        .eq('id', supervisorId)
        .single();
      const sup = supData as SupervisorRow | null;
      if (!sup?.email) continue;

      const token = crypto.randomBytes(24).toString('base64url');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await supabase.from('shift_approval_tokens').insert({
        token,
        shift_ids: supShifts.map((s) => s.id),
        supervisor_id: supervisorId,
        expires_at: expiresAt,
      });

      const approvalUrl = `${appUrl}/approve/${token}`;
      const body = buildEmailBody(sup.first_name ?? 'there', supShifts, approvalUrl);

      await resend.emails.send({
        from: 'FLOSTRUCTION <noreply@flosmosis.com.au>',
        to: sup.email,
        subject: `[FLOSTRUCTION] Shift approval needed — ${supShifts.length} worker${supShifts.length === 1 ? '' : 's'} pending`,
        text: body,
      });

      await supabase
        .from('shifts')
        .update({
          fallback_email_sent: true,
          fallback_email_sent_at: new Date().toISOString(),
        })
        .in('id', supShifts.map((s) => s.id));

      sentCount += supShifts.length;
    }

    return NextResponse.json({ sent: sentCount, supervisors: bySupervisor.size });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
