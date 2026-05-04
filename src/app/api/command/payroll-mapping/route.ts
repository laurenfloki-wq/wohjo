// /api/command/payroll-mapping — list + upsert tenant_activity_mappings
//
// GET  → returns the tenant's full mapping list, including unmapped
//        FLOSTRUCTION canonical categories (so the admin UI can show
//        "needs mapping" rows without round-trips).
// POST → upsert ONE mapping row { flostruction_category, myob_activity_id }.
//        Tenant-scoped to the calling admin's company_id.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { routeLogger } from '@/lib/logger';

// FLOSTRUCTION canonical category list. The admin UI seeds an empty
// row for each so Mo can fill in his MYOB Activity ID for every
// category in one pass during onboarding.
export const CANONICAL_CATEGORIES = [
  'ordinary_hours',
  'overtime_1_5x',
  'overtime_2x',
  'rdo_deductions_cw2',
  'travel_allowance',
  'meal_allowance',
  'inclement_weather_cw2',
  'multi_storey_allowance',
] as const;

interface MappingRow {
  flostruction_category: string;
  myob_activity_id: string;
  updated_at: string | null;
}

export async function GET(request: Request) {
  const log = routeLogger(
    'GET /api/command/payroll-mapping',
    request.headers.get('x-request-id'),
  );
  log.info({ method: 'GET' }, 'request.received');

  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('tenant_activity_mappings')
    .select('flostruction_category, myob_activity_id, updated_at')
    .eq('tenant_id', companyId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const existing = new Map<string, MappingRow>(
    (data ?? []).map((r) => [
      r.flostruction_category as string,
      r as MappingRow,
    ]),
  );

  // Merge canonical categories with existing rows so the UI shows
  // every canonical category, with empty myob_activity_id for any
  // not yet mapped.
  const merged = CANONICAL_CATEGORIES.map((cat) => {
    const row = existing.get(cat);
    return {
      flostruction_category: cat,
      myob_activity_id: row?.myob_activity_id ?? '',
      updated_at: row?.updated_at ?? null,
    };
  });

  // Plus any custom (non-canonical) categories the tenant has added.
  for (const [cat, row] of existing) {
    if (!CANONICAL_CATEGORIES.includes(cat as typeof CANONICAL_CATEGORIES[number])) {
      merged.push({
        flostruction_category: cat,
        myob_activity_id: row.myob_activity_id,
        updated_at: row.updated_at,
      });
    }
  }

  return NextResponse.json({ mappings: merged });
}

export async function POST(request: Request) {
  const log = routeLogger(
    'POST /api/command/payroll-mapping',
    request.headers.get('x-request-id'),
  );
  log.info({ method: 'POST' }, 'request.received');

  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  let body: { flostruction_category?: unknown; myob_activity_id?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const cat =
    typeof body.flostruction_category === 'string'
      ? body.flostruction_category.trim()
      : '';
  const aid =
    typeof body.myob_activity_id === 'string'
      ? body.myob_activity_id.trim()
      : '';
  if (!cat) {
    return NextResponse.json(
      { error: 'flostruction_category required' },
      { status: 400 },
    );
  }

  // Defence: the FLOSTRUCTION canonical list is enum-flavoured. Custom
  // categories are allowed but kept short to avoid arbitrary writes.
  if (cat.length > 64 || aid.length > 64) {
    return NextResponse.json(
      { error: 'category and activity_id capped at 64 chars' },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  // Upsert pattern: DELETE-then-INSERT under transaction would be
  // cleaner but the unique constraint on (tenant_id, flostruction_category)
  // makes a single ON CONFLICT viable. Supabase JS doesn't natively
  // support ON CONFLICT — use upsert() with the unique-key set.
  const { error } = await supabase
    .from('tenant_activity_mappings')
    .upsert(
      {
        tenant_id: companyId,
        flostruction_category: cat,
        myob_activity_id: aid,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,flostruction_category' },
    );
  if (error) {
    log.error({ err: error.message }, 'payroll_mapping.upsert_failed');
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
