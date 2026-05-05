// Monday Task 6 — bulk worker CSV import (Mo onboarding canonical path).
//
// POST /api/admin/import/workers
// Body: { csv: string } — the CSV text per ~/Desktop/FLOSTRUCTION-Build/
//                         mo-worker-import-template.csv
//
// Format pinned by mo-worker-import-template.csv:
//   first_name,last_name,phone,super_fund,abn,award_classification,pay_rate,employee_id
//
// Tenant scoping: company_id is derived server-side via the session.
// Body-supplied company_id (if any) is ignored. GAP-A3-001 closure
// pattern (see Day 5 P1 commits + tests/cross-tenant/boundaries.test.ts).
//
// Atomicity: each row is validated up-front. If any row fails
// validation, NO inserts happen. Validation is structural only —
// duplicate-phone collisions surface as PG errors mid-insert; on
// first such error we stop and return what we got.
//
// Phone format: per CLAUDE.md, supervisors/workers use +61XXXXXXXXX.
// We normalise common variants (61XXXXXXXXX, 0XXXXXXXXX) at parse
// time but reject anything that doesn't fit one of the three forms.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limit';
import { routeLogger } from '@/lib/logger';

interface WorkerRow {
  first_name: string;
  last_name: string;
  phone: string;
  super_fund: string | null;
  abn: string | null;
  award_classification: string | null;
  pay_rate: string;
  employee_id: string;
}

const CSV_HEADER =
  'first_name,last_name,phone,super_fund,abn,award_classification,pay_rate,employee_id';

// Normalise to canonical +61XXXXXXXXX. Returns null if unparseable.
function normalisePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '');
  // 04XX XXX XXX or 04XXXXXXXX → +614XXXXXXXX
  if (/^0\d{9}$/.test(digits)) return '+61' + digits.slice(1);
  // 614XXXXXXXX or 612XXXXXXX (Canberra landline) → +614XXXXXXXX
  if (/^61\d{9}$/.test(digits)) return '+' + digits;
  // Already +614XXXXXXXX
  if (/^\+61\d{9}$/.test(digits)) return digits;
  return null;
}

interface ParseResult {
  rows: WorkerRow[];
  errors: string[];
}

function parseCsv(csv: string): ParseResult {
  const errors: string[] = [];
  const rows: WorkerRow[] = [];

  const lines = csv.trim().split(/\r?\n/);
  if (lines.length === 0) {
    return { rows, errors: ['CSV is empty'] };
  }

  // Header validation — strict, no flexibility on column names.
  const header = lines[0].trim();
  if (header !== CSV_HEADER) {
    return {
      rows,
      errors: [
        `Header mismatch. Expected: "${CSV_HEADER}". Got: "${header}".`,
      ],
    };
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue; // skip blank lines
    const cols = line.split(',');
    if (cols.length !== 8) {
      errors.push(
        `Line ${i + 1}: expected 8 columns, got ${cols.length}`,
      );
      continue;
    }
    const [
      first_name, last_name, phone_raw,
      super_fund, abn, award_classification,
      pay_rate, employee_id,
    ] = cols.map((c) => c.trim());

    if (!first_name || !last_name || !phone_raw || !pay_rate || !employee_id) {
      errors.push(
        `Line ${i + 1}: first_name, last_name, phone, pay_rate, employee_id are required`,
      );
      continue;
    }

    const phone = normalisePhone(phone_raw);
    if (!phone) {
      errors.push(
        `Line ${i + 1}: phone "${phone_raw}" is not a valid Australian mobile (expected +61XXXXXXXXX, 61XXXXXXXXX, or 04XXXXXXXX)`,
      );
      continue;
    }

    const payRateNum = parseFloat(pay_rate);
    if (isNaN(payRateNum) || payRateNum < 0.01 || payRateNum > 500) {
      errors.push(
        `Line ${i + 1}: pay_rate "${pay_rate}" must be between $0.01 and $500.00`,
      );
      continue;
    }

    rows.push({
      first_name,
      last_name,
      phone,
      super_fund: super_fund || null,
      abn: abn || null,
      award_classification: award_classification || null,
      pay_rate: payRateNum.toFixed(2),
      employee_id,
    });
  }

  return { rows, errors };
}

export async function POST(request: Request) {
  const log = routeLogger(
    'POST /api/admin/import/workers',
    request.headers.get('x-request-id'),
  );
  log.info({ method: 'POST' }, 'request.received');

  // Rate limit — bulk imports are expensive. 10 per hour per IP.
  const ip = getClientIP(request);
  const rl = checkRateLimit(`admin.import.workers:${ip}`, {
    windowMs: 60 * 60 * 1000,
    maxRequests: 10,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again in an hour.' },
      { status: 429 },
    );
  }

  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  let body: { csv?: string };
  try {
    body = (await request.json()) as { csv?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  if (!body.csv || typeof body.csv !== 'string') {
    return NextResponse.json(
      { error: 'csv (string) required in body' },
      { status: 400 },
    );
  }

  // Cap CSV size to a sane bound. 1MB ≈ 10,000+ workers; well above
  // founding-cohort scale. Prevents DoS via giant payload.
  if (body.csv.length > 1_048_576) {
    return NextResponse.json(
      { error: 'CSV too large. Max 1MB.' },
      { status: 413 },
    );
  }

  const { rows, errors } = parseCsv(body.csv);

  // Atomicity at the validation layer: if any row failed parse, return
  // ALL errors and write nothing. Lauren fixes the CSV and re-runs.
  if (errors.length > 0) {
    log.warn({ errorCount: errors.length }, 'admin.import.workers.parse_errors');
    return NextResponse.json(
      { error: 'CSV parse errors. No workers imported.', details: errors },
      { status: 400 },
    );
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'No worker rows in CSV (after header).' },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  // Pre-flight duplicate-phone check WITHIN the calling tenant. PG
  // doesn't have a unique constraint on (company_id, phone) — that's a
  // separate substrate-DD finding for Lauren — so we do the check at
  // the application layer with a single query.
  const phones = rows.map((r) => r.phone);
  const { data: existing } = await supabase
    .from('workers')
    .select('phone')
    .eq('company_id', companyId)
    .in('phone', phones);

  if (existing && existing.length > 0) {
    const dupes = existing.map((e: { phone: string }) => e.phone as string);
    return NextResponse.json(
      {
        error: 'Some phone numbers already exist in your tenant. No workers imported.',
        duplicates: dupes,
      },
      { status: 409 },
    );
  }

  // Bulk insert. company_id is server-derived; nothing from body
  // can leak into another tenant.
  const inserts = rows.map((r) => ({
    company_id: companyId,
    first_name: r.first_name,
    last_name: r.last_name,
    phone: r.phone,
    employee_id: r.employee_id,
    pay_rate: r.pay_rate,
    award_classification: r.award_classification,
    is_active: true,
  }));

  const { data: inserted, error } = await supabase
    .from('workers')
    .insert(inserts)
    .select('id, first_name, last_name, phone, employee_id');

  if (error) {
    log.error({ err: error.message }, 'admin.import.workers.insert_failed');
    return NextResponse.json(
      { error: 'Insert failed. No workers imported.', details: error.message },
      { status: 500 },
    );
  }

  log.info(
    { count: inserted?.length ?? 0, companyId },
    'admin.import.workers.success',
  );

  return NextResponse.json(
    { imported: inserted?.length ?? 0, workers: inserted ?? [] },
    { status: 201 },
  );
}
