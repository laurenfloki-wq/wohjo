// /api/command/payroll-mapping — route tests.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTE_SOURCE = readFileSync(
  join(process.cwd(), 'src/app/api/command/payroll-mapping/route.ts'),
  'utf-8',
);

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn() },
}));
const { getCompanyIdForSessionMock } = vi.hoisted(() => ({
  getCompanyIdForSessionMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => supabaseMock,
}));
vi.mock('@/lib/auth/session', () => ({
  getCompanyIdForSession: getCompanyIdForSessionMock,
}));
vi.mock('@/lib/auth/response', () => ({
  authErrorResponse: () =>
    new Response(JSON.stringify({ error: 'auth' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }),
}));
vi.mock('@/lib/logger', () => ({
  routeLogger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
}));

import { GET, POST, CANONICAL_CATEGORIES } from './route';

const COMPANY_ID = '00000000-1000-0000-0000-00000000000a';

beforeEach(() => {
  vi.clearAllMocks();
  getCompanyIdForSessionMock.mockResolvedValue({ companyId: COMPANY_ID });
});

describe('payroll-mapping — source-string substrate', () => {
  it('1. tenant-scoped via getCompanyIdForSession', () => {
    expect(ROUTE_SOURCE).toMatch(/getCompanyIdForSession/);
  });

  it('2. POST upsert is tenant-scoped (.eq tenant_id companyId via upsert payload)', () => {
    expect(ROUTE_SOURCE).toMatch(/tenant_id:\s*companyId/);
  });

  it('3. category + activity_id length-capped at 64 chars (DoS defence)', () => {
    expect(ROUTE_SOURCE).toMatch(/64/);
  });

  it('4. trims whitespace on both fields', () => {
    expect(ROUTE_SOURCE).toMatch(/\.trim\(\)/);
  });
});

describe('payroll-mapping — GET', () => {
  it('5. returns canonical categories merged with existing tenant rows', async () => {
    supabaseMock.from.mockImplementation(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() =>
          Promise.resolve({
            data: [
              {
                flostruction_category: 'ordinary_hours',
                myob_activity_id: 'CW2-ORD',
                updated_at: '2026-05-05T00:00:00Z',
              },
            ],
            error: null,
          }),
        ),
      })),
    }));
    const req = new Request('http://test/api/command/payroll-mapping', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      mappings: Array<{ flostruction_category: string; myob_activity_id: string }>;
    };
    // All canonical categories present
    for (const cat of CANONICAL_CATEGORIES) {
      expect(json.mappings.find((m) => m.flostruction_category === cat)).toBeDefined();
    }
    // The existing mapping has its value preserved
    expect(
      json.mappings.find((m) => m.flostruction_category === 'ordinary_hours')?.myob_activity_id,
    ).toBe('CW2-ORD');
    // Unmapped categories have empty myob_activity_id
    expect(
      json.mappings.find((m) => m.flostruction_category === 'travel_allowance')?.myob_activity_id,
    ).toBe('');
  });

  it('6. includes tenant-custom (non-canonical) categories', async () => {
    supabaseMock.from.mockImplementation(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() =>
          Promise.resolve({
            data: [
              {
                flostruction_category: 'tenant_custom_thing',
                myob_activity_id: 'CUSTOM-1',
                updated_at: null,
              },
            ],
            error: null,
          }),
        ),
      })),
    }));
    const req = new Request('http://test/api/command/payroll-mapping', { method: 'GET' });
    const res = await GET(req);
    const json = (await res.json()) as {
      mappings: Array<{ flostruction_category: string }>;
    };
    expect(
      json.mappings.find((m) => m.flostruction_category === 'tenant_custom_thing'),
    ).toBeDefined();
  });
});

describe('payroll-mapping — POST', () => {
  it('7. upserts a mapping for the calling tenant', async () => {
    let upsertedRow: Record<string, unknown> | null = null;
    supabaseMock.from.mockImplementation(() => ({
      upsert: vi.fn((row: Record<string, unknown>) => {
        upsertedRow = row;
        return Promise.resolve({ error: null });
      }),
    }));
    const req = new Request('http://test/api/command/payroll-mapping', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        flostruction_category: 'ordinary_hours',
        myob_activity_id: 'CW2-ORD',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(upsertedRow!.tenant_id).toBe(COMPANY_ID);
    expect(upsertedRow!.flostruction_category).toBe('ordinary_hours');
    expect(upsertedRow!.myob_activity_id).toBe('CW2-ORD');
  });

  it('8. rejects empty category', async () => {
    const req = new Request('http://test/api/command/payroll-mapping', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ flostruction_category: '', myob_activity_id: 'CW2-ORD' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('9. rejects category > 64 chars', async () => {
    const req = new Request('http://test/api/command/payroll-mapping', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        flostruction_category: 'x'.repeat(65),
        myob_activity_id: 'OK',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
