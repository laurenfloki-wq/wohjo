// Flostruction — Dispatcher Reconciliation Cron
// GET /api/cron/dispatcher-reconcile
// Runs daily at 17:00 AEST (07:00 UTC).
// Patch 5.3 (CRACK 98 closure follow-on).
//
// Catches dispatcher silent-failure cases where supervisor-batch sent the
// SMS but the supervisor row UPDATE failed (e.g., schema drift, transient
// DB error). Re-attempts the UPDATE so the supervisor's pending list is
// in sync with what was sent. Logs reconciliation outcomes.
//
// Runs after the 16:30 AEST batch dispatch so any failures from today's
// run are caught + remediated within ~30 minutes.
//
// CREDENTIAL REQUIRED: CRON_SECRET

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { routeLogger } from '@/lib/logger';

interface AuditLogRow {
  supervisor_id: string;
  codes_sent: string[];
  run_at: string;
}

export async function GET(request: Request) {
  const log = routeLogger('GET /api/cron/dispatcher-reconcile', request.headers.get('x-request-id'));
  log.info({ method: 'GET' }, 'request.received');

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Find audit log entries from the last 24 hours where DB write failed
  // and reconciliation hasn't been attempted yet.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: failures, error: queryError } = await supabase
    .from('dispatcher_audit_log')
    .select('supervisor_id, codes_sent, run_at')
    .eq('db_write_success', false)
    .eq('reconciled', false)
    .gte('run_at', cutoff);

  if (queryError) {
    log.error({ error: queryError.message }, 'reconcile.query.failed');
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  let reconciled = 0;
  let stillFailing = 0;

  for (const fail of (failures ?? []) as AuditLogRow[]) {
    // Re-attempt the supervisor row update with the codes that were
    // already SMSed but never persisted.
    const { error: updateError } = await supabase
      .from('supervisors')
      .update({
        pending_sms_approval_ids: fail.codes_sent,
        last_batch_sms_sent_at: fail.run_at,
      })
      .eq('id', fail.supervisor_id);

    if (!updateError) {
      // Mark the audit row as reconciled so we don't retry next run.
      const { error: markError } = await supabase
        .from('dispatcher_audit_log')
        .update({ reconciled: true })
        .eq('supervisor_id', fail.supervisor_id)
        .eq('run_at', fail.run_at);

      if (markError) {
        log.error({
          supervisorId: fail.supervisor_id,
          error: markError.message,
        }, 'reconcile.mark.failed');
      }

      log.info({
        supervisorId: fail.supervisor_id,
        codes: fail.codes_sent,
      }, 'reconciled');
      reconciled++;
    } else {
      log.error({
        supervisorId: fail.supervisor_id,
        error: updateError.message,
      }, 'reconcile.update.failed');
      stillFailing++;
    }
  }

  return NextResponse.json({
    status: 'complete',
    found: failures?.length ?? 0,
    reconciled,
    stillFailing,
    timestamp: new Date().toISOString(),
  });
}
