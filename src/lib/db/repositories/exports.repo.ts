// Flostruction — Exports / worker-record-exports repositories (W1.3, 2026-06-10)
//
// Scope bound at the factory: company for payroll exports, worker for
// the right-to-export audit log. Insert payloads keep their route
// literals; the scope column is supplied by the binding — same pattern
// as shiftEventsMutationRepo.insertV0Event (slice-2b precedent).

import { getServiceClient } from '@/lib/db/service-client';

/** Company-scoped exports access for command routes. */
export function exportsRepo(companyId: string) {
  const db = getServiceClient();
  return {
    // command/export — insert relocated verbatim; company_id supplied by
    // the factory binding (equals the session-derived companyId the
    // route previously inlined).
    insertExport: (row: Record<string, unknown>) =>
      db
        .from('exports')
        .insert({ ...row, company_id: companyId })
        .select('id')
        .single(),
  };
}

/** Worker-self audit log for the right-to-export surface. */
export function workerRecordExportsRepo(workerId: string) {
  const db = getServiceClient();
  return {
    // worker/records/export — insert relocated verbatim; worker_id from
    // the binding (the session-resolved worker row's id).
    insertExportRecord: (row: Record<string, unknown>) =>
      db.from('worker_record_exports').insert({ ...row, worker_id: workerId }),
  };
}
