// FLOSTRUCTION /command — payroll-mapping setup-blocker probe (M4-K).
// GET /api/command/setup/payroll-mapping
//
// Returns the tenant's mapping status so /command/evidence and any
// future /command/payroll-mapping surface can render a setup-blocker
// inline WITHOUT triggering the full export pipeline. Tiny endpoint:
// one read.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { loadTenantMappings } from '@/lib/exports/tenant-mappings';
import { routeLogger } from '@/lib/logger';

export async function GET(request: Request): Promise<Response> {
  const log = routeLogger(
    'GET /api/command/setup/payroll-mapping',
    request.headers.get('x-request-id'),
  );

  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const supabase = createServiceClient();
  const { mappings, setup_blocker } = await loadTenantMappings(
    supabase as unknown as Parameters<typeof loadTenantMappings>[0],
    companyId,
  );

  // Surface the canonical categories the tenant has mapped so the
  // UI can show which ones are still pending. We do NOT echo the
  // MYOB Activity IDs themselves — those are operator-configured
  // identifiers and not needed for the setup-blocker UI.
  return NextResponse.json({
    setup_blocker,
    mapped_categories: Array.from(mappings.keys()).sort(),
    configure_at: '/command/payroll-mapping',
  });
}
