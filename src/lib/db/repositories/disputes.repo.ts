// Flostruction — Worker disputes repository (W1.4, 2026-06-10)
//
// Dual scope bound at the factory (worker + company, both from the
// verified session identity); query shapes byte-identical to the
// previous worker/disputes route inlines.

import { getServiceClient } from '@/lib/db/service-client';

/** Worker+company-scoped dispute access for worker routes.
 *  companyId comes from the verified worker identity and MAY be null
 *  (a worker not yet linked to a company) — written as-is, exactly as
 *  the routes previously inlined. */
export function workerDisputesRepo(workerId: string, companyId: string | null) {
  const db = getServiceClient();
  return {
    // POST insert (both worker/disputes and worker/disputes/new) —
    // worker_id + company_id from the binding.
    insertDispute: (row: Record<string, unknown>) =>
      db
        .from('worker_disputes')
        .insert({ ...row, worker_id: workerId, company_id: companyId })
        .select('id, created_at')
        .single(),

    // GET list — relocated verbatim.
    listMine: () =>
      db
        .from('worker_disputes')
        .select(
          'id, dispute_type, narrative, related_shift_id, status, resolution_notes, resolved_at, created_at, updated_at',
        )
        .eq('worker_id', workerId)
        .order('created_at', { ascending: false }),
  };
}
