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

    // exports/myob (W1.3 part B) — atomic write hand-off.
    // process_flostruction_export handles: INSERT exports, UPDATE shifts,
    // INSERT EXPORT_RECORD events with correct per-worker chain linkage.
    // p_company_id comes from the factory binding.
    processFlostructionExport: (args: {
      adminUserId: string;
      shiftIds: string[];
      fileHash: string;
    }) =>
      db.rpc('process_flostruction_export', {
        p_company_id: companyId,
        p_admin_user_id: args.adminUserId,
        p_shift_ids: args.shiftIds,
        p_file_hash: args.fileHash,
      }),
  };
}

/** Tenant-scoped activity-mapping reads for the MYOB export surface.
 *  tenant_activity_mappings.tenant_id is an FK to companies.id
 *  (founder-pinned 2026-06-10): the factory binds tenant_id to the
 *  session-derived companyId. Query relocated verbatim from both
 *  exports/myob handlers (identical shape, one method). */
export function tenantActivityMappingsRepo(companyId: string) {
  const db = getServiceClient();
  return {
    listMyobActivityMappings: () =>
      db
        .from('tenant_activity_mappings')
        .select('flostruction_category, myob_activity_id')
        .eq('tenant_id', companyId),
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
