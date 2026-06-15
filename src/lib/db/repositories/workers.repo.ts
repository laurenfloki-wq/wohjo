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

    getById: (id: string) =>
      db
        .from('workers')
        .select(
          'id, first_name, last_name, phone, email, employee_id, pay_rate, award_classification, is_active, created_at',
        )
        .eq('id', id)
        .eq('company_id', companyId)
        .maybeSingle(),

    updateFields: (id: string, patch: Record<string, unknown>) =>
      db
        .from('workers')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('company_id', companyId)
        .select(
          'id, first_name, last_name, phone, email, employee_id, pay_rate, award_classification, is_active',
        )
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

    // exports/myob full pipeline (W1.3 part B) — card id with the
    // CRACK-229 employee_id fallback column; relocated verbatim.
    listMyobCardsWithEmployeeIds: (workerIds: string[]) =>
      db
        .from('workers')
        .select('id, myob_card_id, employee_id')
        .eq('company_id', companyId)
        .in('id', workerIds),

    // exports/myob legacy path — card id only; relocated verbatim.
    listMyobCards: (workerIds: string[]) =>
      db
        .from('workers')
        .select('id, myob_card_id')
        .eq('company_id', companyId)
        .in('id', workerIds),

    // admin/import/workers (W1.4) — tenant-scoped duplicate-phone
    // pre-check; relocated verbatim.
    listExistingPhones: (phones: string[]) =>
      db
        .from('workers')
        .select('phone')
        .eq('company_id', companyId)
        .in('phone', phones),

    // admin/import/workers (W1.4) — bulk insert; company_id mapped
    // onto every row by the binding (server-derived, nothing from the
    // body can leak into another tenant).
    bulkCreate: (rows: Array<Record<string, unknown>>) =>
      db
        .from('workers')
        .insert(rows.map((r) => ({ ...r, company_id: companyId })))
        .select('id, first_name, last_name, phone, employee_id'),

    // admin/workers/bulk-upload (W1.4) — atomic RPC hand-off;
    // p_company_id from the binding.
    bulkCreateWorkersRpc: (args: {
      adminUserId: string;
      workers: Array<Record<string, unknown>>;
    }) =>
      db.rpc('bulk_create_workers', {
        p_company_id: companyId,
        p_admin_user_id: args.adminUserId,
        p_workers: args.workers,
      }),
  };
}

/** Worker-self access for field routes (scoped by verified workerId). */
export function workerSelfRepo(workerId: string) {
  const db = getServiceClient();
  return {
    // Never includes pay_rate — pay is calculated by the payroll provider.
    getProfile: () =>
      db.from('workers').select(WORKER_SELF_COLUMNS).eq('id', workerId).single(),

    // field/earnings/week (W1.4) — relocated verbatim. pay_rate is the
    // worker's OWN rate (worker-self surface).
    getPayRate: () =>
      db.from('workers').select('pay_rate').eq('id', workerId).single(),

    // field/home-data (W1.4) — relocated verbatim.
    getHomeProfile: () =>
      db
        .from('workers')
        .select('id, first_name, last_name, employee_id, company_id')
        .eq('id', workerId)
        .single(),
    getPrimarySiteId: () =>
      db.from('workers').select('primary_site_id').eq('id', workerId).maybeSingle(),

    // field/receipt (W1.4) — relocated; the receipt's shift row is
    // fetched .eq('worker_id', workerId), so its worker_id equals this
    // binding by construction.
    getReceiptProfile: () =>
      db.from('workers').select('first_name, last_name, pay_rate').eq('id', workerId).single(),

    // worker/mfa/issue (W1.4) — relocated verbatim.
    getMfaEmailProfile: () =>
      db.from('workers').select('id, email, first_name').eq('id', workerId).maybeSingle(),

    // worker/mfa/challenge (W1.4) — relocated verbatim.
    getMfaPhoneProfile: () =>
      db.from('workers').select('id, phone, first_name').eq('id', workerId).maybeSingle(),

    // field/shift/start (W1.4) — relocated verbatim (active workers only).
    getActiveForShiftStart: () =>
      db
        .from('workers')
        .select('id, company_id, pay_rate, phone')
        .eq('id', workerId)
        .eq('is_active', true)
        .single(),

    // field/shift/end auth_events side-pipe (W1.4) — relocated verbatim;
    // bound to the verified shift's worker_id (cross-worker guard ran).
    getPhone: () =>
      db.from('workers').select('phone').eq('id', workerId).maybeSingle(),
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

/** Identity-derivation lookup for the worker dispute channel (W1.4):
 *  same contract as workerByAuthUserId — the verified session user IS
 *  the scope — with the dispute surface's column list, relocated
 *  verbatim from worker/disputes/new. */
export function workerByAuthUserIdForDisputes(userId: string) {
  const db = getServiceClient();
  return db
    .from('workers')
    .select('id, company_id, first_name, last_name, phone, employment_end_date')
    .eq('user_id', userId)
    .maybeSingle();
}
