// FLOSTRUCTION — tenant_activity_mappings loader.
//
// Reads the per-tenant FLOSTRUCTION-canonical-category -> MYOB
// Activity ID mappings from public.tenant_activity_mappings. A 0-row
// result for a tenant is a SETUP BLOCKER, not a silent default;
// downstream routes surface this with a 422 + a pointer at
// /command/payroll-mapping.

import type { TenantActivityMappings } from './payroll-file';

interface SupabaseLike {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: unknown): Promise<{
        data: Array<{ flostruction_category: string; myob_activity_id: string }> | null;
        error: { message?: string } | null;
      }>;
    };
  };
}

export interface LoadTenantMappingsResult {
  mappings: TenantActivityMappings;
  /** True if the tenant has not yet configured any mapping rows. */
  setup_blocker: boolean;
}

export async function loadTenantMappings(
  supabase: SupabaseLike,
  companyId: string,
): Promise<LoadTenantMappingsResult> {
  const { data, error } = await supabase
    .from('tenant_activity_mappings')
    .select('flostruction_category, myob_activity_id')
    .eq('tenant_id', companyId);
  if (error) {
    throw new Error(`tenant_activity_mappings load failed: ${error.message ?? 'unknown'}`);
  }
  const rows = data ?? [];
  const mappings: TenantActivityMappings = new Map();
  for (const r of rows) {
    mappings.set(r.flostruction_category, r.myob_activity_id);
  }
  return {
    mappings,
    setup_blocker: mappings.size === 0,
  };
}
