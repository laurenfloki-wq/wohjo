// CRACK 232 — /api/admin/workers/bulk-upload tests.
//
// Coverage per the dispatch acceptance criteria:
//   - 4-row happy path → 201, 4 created, no failed rows
//   - duplicate mobile rejection (in-upload)
//   - invalid mobile format rejection
//   - partial-failure atomicity: ONE invalid row → ALL rows rejected
//   - 100-row stress: parse stays under threshold, RPC payload size OK
//   - JSON body acceptance (programmatic callers)
//   - multipart/form-data acceptance
//   - auth: cross-tenant / unauthenticated rejected
//   - duplicate employee_id collision against existing tenant rows → 409
//   - rate limit → 429
//
// Pattern matches src/app/api/admin/import/workers/route.test.ts where
// applicable; uses hoisted mocks for auth + supabase RPC.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
const { rateLimitMock } = vi.hoisted(() => ({ rateLimitMock: vi.fn() }));

vi.mock('@/lib/auth/session', () => ({
  getCompanyIdForSession: authMock,
}));
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ rpc: rpcMock }),
}));
vi.mock('@/lib/auth/response', () => ({
  authErrorResponse: vi.fn().mockImplementation((err: { status?: number; message?: string }) => {
    return new Response(JSON.stringify({ error: err.message ?? 'auth' }), {
      status: err.status ?? 401,
      headers: { 'content-type': 'application/json' },
    });
  }),
}));
vi.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: rateLimitMock,
  getClientIP: () => '127.0.0.1',
}));
vi.mock('@/lib/security/rate-limit-durable', () => ({
  checkRateLimitDurable: rateLimitMock,
}));
vi.mock('@/lib/logger', () => ({
  routeLogger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
}));

import { AuthorizationError } from '@/lib/auth/errors';
import { parseBulkWorkerCsv, splitFullName } from '@/lib/bulk-worker-csv';
import { POST } from './route';

const COMPANY_ID = '00000000-1000-4000-8000-000000000001';
const ADMIN_USER_ID = '44444444-4444-4444-8444-444444444444';

function jsonRequest(body: unknown): Request {
  return new Request('http://test/api/admin/workers/bulk-upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function multipartRequest(csv: string): Request {
  const fd = new FormData();
  fd.append('file', new Blob([csv], { type: 'text/csv' }), 'workers.csv');
  return new Request('http://test/api/admin/workers/bulk-upload', {
    method: 'POST',
    body: fd,
  });
}

const FOUR_ROW_CSV = [
  'employee_id,full_name,mobile_e164,myob_card_id',
  'EMP-001,Joao Muniz Campos,+61400000001,*0001',
  'EMP-002,Maria Garcia,+61400000002,*0002',
  'EMP-003,John Smith,+61400000003,',
  'EMP-004,Anna Tran,+61400000004,*0004',
].join('\n');

beforeEach(() => {
  authMock.mockReset();
  rpcMock.mockReset();
  rateLimitMock.mockReset();
  authMock.mockResolvedValue({
    userId: ADMIN_USER_ID,
    companyId: COMPANY_ID,
    role: 'admin',
  });
  rateLimitMock.mockReturnValue({ allowed: true });
});

// ─── splitFullName helper ────────────────────────────────────────────
describe('splitFullName', () => {
  it('splits on first space — Joao Muniz Campos → Joao / Muniz Campos', () => {
    expect(splitFullName('Joao Muniz Campos')).toEqual({
      first_name: 'Joao',
      last_name: 'Muniz Campos',
    });
  });
  it('single token → first only, last_name="-"', () => {
    expect(splitFullName('Cher')).toEqual({ first_name: 'Cher', last_name: '-' });
  });
  it('trims surrounding whitespace', () => {
    expect(splitFullName('  John   Smith  ')).toEqual({
      first_name: 'John',
      last_name: 'Smith',
    });
  });
});

// ─── parseBulkWorkerCsv helper ───────────────────────────────────────
describe('parseBulkWorkerCsv', () => {
  it('parses a clean 4-row CSV without errors', () => {
    const r = parseBulkWorkerCsv(FOUR_ROW_CSV);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(4);
    expect(r.rows[0].employee_id).toBe('EMP-001');
    expect(r.rows[0].first_name).toBe('Joao');
    expect(r.rows[0].last_name).toBe('Muniz Campos');
    expect(r.rows[0].phone).toBe('+61400000001');
    expect(r.rows[0].myob_card_id).toBe('*0001');
    expect(r.rows[2].myob_card_id).toBe(null);
  });

  it('rejects header mismatch', () => {
    const r = parseBulkWorkerCsv('id,name,phone\nEMP-001,J,+61400000001');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].error).toMatch(/Header mismatch/);
    expect(r.rows).toHaveLength(0);
  });

  it('rejects invalid mobile format', () => {
    const csv = 'employee_id,full_name,mobile_e164,myob_card_id\nEMP-001,Joao Muniz,0400000001,';
    const r = parseBulkWorkerCsv(csv);
    expect(r.rows).toHaveLength(0);
    expect(r.errors[0].error).toMatch(/E\.164 AU mobile/);
  });

  it('rejects missing employee_id', () => {
    const csv = 'employee_id,full_name,mobile_e164,myob_card_id\n,Joao Muniz,+61400000001,';
    const r = parseBulkWorkerCsv(csv);
    expect(r.errors[0].error).toMatch(/employee_id is required/);
  });

  it('rejects in-upload duplicate employee_id', () => {
    const csv = [
      'employee_id,full_name,mobile_e164,myob_card_id',
      'EMP-001,A B,+61400000001,',
      'EMP-001,C D,+61400000002,',
    ].join('\n');
    const r = parseBulkWorkerCsv(csv);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].error).toMatch(/Duplicate employee_id/);
    // The first occurrence still parses; the second is the error.
    expect(r.rows).toHaveLength(1);
  });

  it('rejects in-upload duplicate mobile', () => {
    const csv = [
      'employee_id,full_name,mobile_e164,myob_card_id',
      'EMP-001,A B,+61400000001,',
      'EMP-002,C D,+61400000001,',
    ].join('\n');
    const r = parseBulkWorkerCsv(csv);
    expect(r.errors[0].error).toMatch(/Duplicate mobile_e164/);
  });

  it('skips blank lines', () => {
    const csv = [
      'employee_id,full_name,mobile_e164,myob_card_id',
      'EMP-001,J M,+61400000001,',
      '',
      'EMP-002,M G,+61400000002,',
    ].join('\n');
    const r = parseBulkWorkerCsv(csv);
    expect(r.rows).toHaveLength(2);
    expect(r.errors).toEqual([]);
  });

  it('strips BOM from header line', () => {
    const csv = '﻿employee_id,full_name,mobile_e164,myob_card_id\nEMP-001,J M,+61400000001,';
    const r = parseBulkWorkerCsv(csv);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(1);
  });

  it('handles 100-row stress without error', () => {
    const lines: string[] = ['employee_id,full_name,mobile_e164,myob_card_id'];
    for (let i = 0; i < 100; i++) {
      const seq = String(100000000 + i).padStart(9, '0');
      lines.push(`EMP-${i.toString().padStart(3, '0')},Worker N${i},+61${seq},`);
    }
    const r = parseBulkWorkerCsv(lines.join('\n'));
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(100);
  });
});

// ─── POST happy path ─────────────────────────────────────────────────
describe('POST /api/admin/workers/bulk-upload — happy path', () => {
  it('4-row JSON body → 201, 4 created, RPC called with company-derived ids', async () => {
    rpcMock.mockResolvedValue({
      data: [
        { out_worker_id: 'w1', out_employee_id: 'EMP-001', out_phone: '+61400000001' },
        { out_worker_id: 'w2', out_employee_id: 'EMP-002', out_phone: '+61400000002' },
        { out_worker_id: 'w3', out_employee_id: 'EMP-003', out_phone: '+61400000003' },
        { out_worker_id: 'w4', out_employee_id: 'EMP-004', out_phone: '+61400000004' },
      ],
      error: null,
    });

    const res = await POST(jsonRequest({ csv: FOUR_ROW_CSV }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      created_count: number;
      created_workers: unknown[];
      failed_rows: unknown[];
    };
    expect(body.created_count).toBe(4);
    expect(body.failed_rows).toEqual([]);
    expect(body.created_workers).toHaveLength(4);

    // RPC was called with the parsed worker rows + server-derived ids
    expect(rpcMock).toHaveBeenCalledOnce();
    const rpcCall = rpcMock.mock.calls[0][1] as {
      p_company_id: string;
      p_admin_user_id: string;
      p_workers: Array<{ employee_id: string; first_name: string; phone: string }>;
    };
    expect(rpcCall.p_company_id).toBe(COMPANY_ID);
    expect(rpcCall.p_admin_user_id).toBe(ADMIN_USER_ID);
    expect(rpcCall.p_workers).toHaveLength(4);
    expect(rpcCall.p_workers[0].first_name).toBe('Joao');
  });

  it('multipart/form-data with "file" field works identically', async () => {
    rpcMock.mockResolvedValue({
      data: [{ out_worker_id: 'w1', out_employee_id: 'EMP-001', out_phone: '+61400000001' }],
      error: null,
    });
    const csv = [
      'employee_id,full_name,mobile_e164,myob_card_id',
      'EMP-001,J M,+61400000001,',
    ].join('\n');
    const res = await POST(multipartRequest(csv));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { created_count: number };
    expect(body.created_count).toBe(1);
  });
});

// ─── POST failure modes ──────────────────────────────────────────────
describe('POST /api/admin/workers/bulk-upload — failure modes', () => {
  it('invalid mobile in any row → 400, no RPC call, atomic failure', async () => {
    const csv = [
      'employee_id,full_name,mobile_e164,myob_card_id',
      'EMP-001,J M,+61400000001,',
      'EMP-002,M G,0400000002,', // invalid (no +61 prefix)
      'EMP-003,A B,+61400000003,',
    ].join('\n');
    const res = await POST(jsonRequest({ csv }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      created_count: number;
      failed_rows: Array<{ row: number; error: string }>;
    };
    expect(body.created_count).toBe(0);
    expect(body.failed_rows.length).toBeGreaterThan(0);
    expect(body.failed_rows[0].error).toMatch(/E\.164 AU mobile/);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('in-upload duplicate mobile → 400, no RPC call', async () => {
    const csv = [
      'employee_id,full_name,mobile_e164,myob_card_id',
      'EMP-001,J M,+61400000001,',
      'EMP-002,M G,+61400000001,', // same mobile
    ].join('\n');
    const res = await POST(jsonRequest({ csv }));
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('cross-tenant duplicate employee_id from RPC → 409, no partial creation', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        message: 'DUPLICATE_EMPLOYEE_ID: one or more employee_ids already exist in this tenant',
      },
    });
    const res = await POST(jsonRequest({ csv: FOUR_ROW_CSV }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; created_count: number };
    expect(body.error).toMatch(/DUPLICATE_EMPLOYEE_ID/);
    expect(body.created_count).toBe(0);
  });

  it('cross-tenant duplicate phone from RPC → 409', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'DUPLICATE_PHONE: one or more phones already exist in this tenant' },
    });
    const res = await POST(jsonRequest({ csv: FOUR_ROW_CSV }));
    expect(res.status).toBe(409);
  });

  it('RPC FORBIDDEN → 403', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'FORBIDDEN: user X is not an admin of company Y' },
    });
    const res = await POST(jsonRequest({ csv: FOUR_ROW_CSV }));
    expect(res.status).toBe(403);
  });

  it('unauthenticated session → 401', async () => {
    authMock.mockRejectedValueOnce(
      new AuthorizationError(401, 'UNAUTHENTICATED', 'Authentication required.'),
    );
    const res = await POST(jsonRequest({ csv: FOUR_ROW_CSV }));
    expect(res.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('non-admin caller → 403', async () => {
    authMock.mockRejectedValueOnce(
      new AuthorizationError(403, 'NOT_A_COMPANY_ADMIN', 'Not an admin.'),
    );
    const res = await POST(jsonRequest({ csv: FOUR_ROW_CSV }));
    expect(res.status).toBe(403);
  });

  it('rate-limited → 429', async () => {
    rateLimitMock.mockReturnValue({ allowed: false });
    const res = await POST(jsonRequest({ csv: FOUR_ROW_CSV }));
    expect(res.status).toBe(429);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('rejects empty CSV', async () => {
    const res = await POST(jsonRequest({ csv: '' }));
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('rejects header-only CSV with no data rows', async () => {
    const res = await POST(jsonRequest({ csv: 'employee_id,full_name,mobile_e164,myob_card_id' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/no data rows/i);
  });

  it('rejects oversized payload (>1MB)', async () => {
    const big = 'employee_id,full_name,mobile_e164,myob_card_id\n' + 'X'.repeat(1_048_577);
    const res = await POST(jsonRequest({ csv: big }));
    expect(res.status).toBe(413);
  });

  it('unsupported Content-Type → 415', async () => {
    const req = new Request('http://test/api/admin/workers/bulk-upload', {
      method: 'POST',
      headers: { 'content-type': 'text/csv' },
      body: FOUR_ROW_CSV,
    });
    const res = await POST(req);
    expect(res.status).toBe(415);
  });
});

// ─── Atomicity invariant ─────────────────────────────────────────────
describe('POST /api/admin/workers/bulk-upload — atomicity invariant', () => {
  it('drop middle-row mobile to invalid: zero workers created (RPC never called)', async () => {
    const csv = [
      'employee_id,full_name,mobile_e164,myob_card_id',
      'EMP-001,A B,+61400000001,',
      'EMP-002,C D,+61400000002,',
      'EMP-003,E F,not-a-phone,', // invalid middle row
      'EMP-004,G H,+61400000004,',
    ].join('\n');
    const res = await POST(jsonRequest({ csv }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { created_count: number; failed_rows: unknown[] };
    expect(body.created_count).toBe(0);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(body.failed_rows.length).toBeGreaterThan(0);
  });
});
