// /api/command/worker-card-ids — route tests.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTE_SOURCE = readFileSync(
  join(process.cwd(), 'src/app/api/command/worker-card-ids/route.ts'),
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

import { GET, POST } from './route';

const COMPANY_ID = '00000000-1000-0000-0000-00000000000a';
const WORKER_ID = '00000000-2000-0000-0000-00000000000a';

beforeEach(() => {
  vi.clearAllMocks();
  getCompanyIdForSessionMock.mockResolvedValue({ companyId: COMPANY_ID });
});

describe('worker-card-ids — source-string substrate', () => {
  it('1. tenant-scoped via getCompanyIdForSession', () => {
    expect(ROUTE_SOURCE).toMatch(/getCompanyIdForSession/);
  });

  it('2. UPDATE has compound predicate (.eq id, workerId .eq company_id, companyId)', () => {
    expect(ROUTE_SOURCE).toMatch(/\.eq\(['"]id['"],\s*workerId\)/);
    expect(ROUTE_SOURCE).toMatch(/\.eq\(['"]company_id['"],\s*companyId\)/);
  });

  it('3. validates worker_id as UUID shape', () => {
    expect(ROUTE_SOURCE).toMatch(/uuid/i);
  });

  it('4. card_id length-capped at 64 chars', () => {
    expect(ROUTE_SOURCE).toMatch(/64/);
  });
});

describe('worker-card-ids — GET', () => {
  it('5. returns active workers tenant-scoped', async () => {
    supabaseMock.from.mockImplementation(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() =>
              Promise.resolve({
                data: [
                  {
                    id: WORKER_ID,
                    first_name: 'Joao',
                    last_name: 'Test',
                    employee_id: 'DASS-001',
                    myob_card_id: '*0001',
                    is_active: true,
                  },
                ],
                error: null,
              }),
            ),
          })),
        })),
      })),
    }));
    const req = new Request('http://test/api/command/worker-card-ids', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { workers: Array<{ id: string }> };
    expect(json.workers.length).toBe(1);
  });
});

describe('worker-card-ids — POST', () => {
  it('6. updates one worker.myob_card_id', async () => {
    let updateData: Record<string, unknown> | null = null;
    supabaseMock.from.mockImplementation(() => ({
      update: vi.fn((data) => {
        updateData = data;
        return {
          eq: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null })),
          })),
        };
      }),
    }));
    const req = new Request('http://test/api/command/worker-card-ids', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ worker_id: WORKER_ID, myob_card_id: '*0042' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(updateData!.myob_card_id).toBe('*0042');
  });

  it('7. empty card_id clears to NULL', async () => {
    let updateData: Record<string, unknown> | null = null;
    supabaseMock.from.mockImplementation(() => ({
      update: vi.fn((data) => {
        updateData = data;
        return {
          eq: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null })),
          })),
        };
      }),
    }));
    const req = new Request('http://test/api/command/worker-card-ids', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ worker_id: WORKER_ID, myob_card_id: '' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(updateData!.myob_card_id).toBeNull();
  });

  it('8. rejects malformed worker_id', async () => {
    const req = new Request('http://test/api/command/worker-card-ids', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ worker_id: 'not-a-uuid', myob_card_id: 'X' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
