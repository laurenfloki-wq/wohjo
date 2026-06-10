// Flostruction — Workers repository (finding C / CP-1, 2026-06-10)
//
// First slice of the service-role confinement migration. Route handlers
// receive these pre-scoped factories instead of the raw bypass-RLS
// client; every query is bound to the companyId / workerId given at
// construction, so tenant scope is structural, not conventional.
// Column lists match the previous route inlines exactly.

import { getServiceClient } from '@/lib/db/service-client';

const WORKER_LIST_COLUMNS =
  'id, first_name, last_name, phone, email, employee_id, pay_rate, award_classification, is_active, created_at';
const WORKER_CARD_ID_COLUMNS =
  'id, first_name, last_name, employee_id, myob_card_id, is_active';
const WORKER_SELF_COLUMNS = 'id, first_name, last_name, employee_id, company_id';

export interface NewWorker {
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  employee_id: string;
  pay_rate: string;
  award_classification: string | null;
}

/** Company-scoped workers access for command/admin routes. */
export function workersRepo(companyId: string) {
  const db = getServiceClient();
  return {
    list: () =>
      db
        .from('workers')
        .select(WORKER_LIST_COLUMNS)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false }),

    findIdByPhone: (phone: string) =>
      db
        .from('workers')
        .select('id')
        .eq('phone', phone)
        .eq('company_id', companyId)
        .maybeSingle(),

    create: (input: NewWorker) =>
      db
        .from('workers')
        .insert({ ...input, company_id: companyId, is_active: true })
        .select('id, first_name, last_name, employee_id')
        .single(),

    listActiveForCardIds: () =>
      db
        .from('workers')
        .select(WORKER_CARD_ID_COLUMNS)
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('last_name', { ascending: true }),

    // Tenant-scoped UPDATE: the company_id predicate rejects cross-tenant
    // attempts — a forged worker_id from another tenant matches zero rows.
    updateMyobCardId: (workerId: string, cardId: string | null) =>
      db
        .from('workers')
        .update({ myob_card_id: cardId })
        .eq('id', workerId)
        .eq('company_id', companyId),
  };
}

/** Worker-self access for field routes (scoped by verified workerId). */
export function workerSelfRepo(workerId: string) {
  const db = getServiceClient();
  return {
    // Never includes pay_rate — pay is calculated by the payroll provider.
    getProfile: () =>
      db.from('workers').select(WORKER_SELF_COLUMNS).eq('id', workerId).single(),
  };
}


/** Identity-derivation lookup for the worker right-to-export surface
 *  (W1.3 2026-06-10): resolves the worker row from the VERIFIED auth
 *  user id. Unscoped by construction — the session user IS the scope;
 *  the row returned can only be the caller's own. Column list
 *  relocated verbatim from worker/records/export. */
export function workerByAuthUserId(userId: string) {
  const db = getServiceClient();
  return db
    .from('workers')
    .select('id, company_id, first_name, last_name, phone, email, employee_id, pay_rate, employment_end_date, records_retained_until')
    .eq('user_id', userId)
    .maybeSingle();
}
