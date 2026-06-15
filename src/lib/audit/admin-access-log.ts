// Immutable admin-action audit (founder build-out, 2026-06-15).
//
// Operational entity edits (worker / supervisor / site) are amendments,
// not edits of evidence: the entity row changes, and a row is written
// here recording who / what / when. public.admin_access_log is
// service-role INSERT/SELECT only with NO update or delete policy, so
// it is append-only by construction. Fail-soft: an audit write never
// gates the user-facing response (matches emitAuthEvent posture).

import type { Logger } from 'pino';
import { createServiceClient } from '@/lib/supabase/server';

export interface AdminActionInput {
  adminUserId: string;
  companyId: string;
  resourceType: 'worker' | 'supervisor' | 'site';
  resourceId: string;
  action: string;
  reasonCode?: string | null;
  request?: Request;
}

function firstIp(forwardedFor: string | null): string | null {
  if (forwardedFor === null) return null;
  return forwardedFor.split(',')[0]?.trim() ?? null;
}

export async function logAdminAction(log: Logger, input: AdminActionInput): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from('admin_access_log').insert({
      admin_user_id: input.adminUserId,
      customer_id_accessed: input.companyId,
      resource_type: input.resourceType,
      resource_id: input.resourceId,
      action: input.action,
      source_ip: input.request ? firstIp(input.request.headers.get('x-forwarded-for')) : null,
      reason_code: (input.reasonCode ?? '').slice(0, 500) || null,
    });
    if (error) {
      log.warn(
        { err: error.message, action: input.action, resourceId: input.resourceId },
        'admin_access_log.write_failed',
      );
    }
  } catch (e) {
    log.warn({ err: e instanceof Error ? e.message : 'unknown' }, 'admin_access_log.write_exception');
  }
}

export interface AdminActionRow {
  id: string;
  action: string;
  reason_code: string | null;
  at: string;
}

export async function listAdminActionsForResource(
  resourceType: 'worker' | 'supervisor' | 'site',
  resourceId: string,
  companyId: string,
  limit = 50,
): Promise<AdminActionRow[]> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('admin_access_log')
      .select('id, action, reason_code, at:timestamp')
      .eq('resource_type', resourceType)
      .eq('resource_id', resourceId)
      .eq('customer_id_accessed', companyId)
      .order('timestamp', { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as AdminActionRow[];
  } catch {
    return [];
  }
}
