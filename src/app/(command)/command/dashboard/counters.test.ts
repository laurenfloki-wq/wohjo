// Tenant-isolation tests for the dashboard counters.
//
// Substrate-DD test added 2026-04-30 after the dashboard page leaked
// cross-tenant counts (queries omitted .eq('company_id', sessionCompany)).
// This test pins the invariant: tenant A admin sees ONLY tenant A
// counts, never tenant B's, and orphan shifts on deleted companies do
// not bleed into either tenant's view.
//
// We do NOT test the React render here — the count-loading function
// was extracted into `loadDashboardCounters(supabase, companyId)` so
// it can be unit-tested against a mock Supabase client without
// dragging the server-component renderer into vitest.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadDashboardCounters } from './counters';

// Synthetic two-tenant fixture. Tenant A is the session admin's
// company; tenant B is unrelated; tenant C ('ghost') is the
// already-deleted-company-with-orphan-shifts case.
const TENANT_A = '11111111-0000-0000-0000-000000000001';
const TENANT_B = '22222222-0000-0000-0000-000000000002';
const TENANT_GHOST = '99999999-0000-0000-0000-000000000099';

type WorkersRow = { id: string; company_id: string; is_active: boolean };
type SitesRow = { id: string; company_id: string; is_active: boolean };
type ShiftsRow = {
  id: string;
  company_id: string;
  status: string;
  shift_date: string;
  total_hours: string;
};

const workersFixture: WorkersRow[] = [
  // tenant A — 2 active, 1 inactive
  { id: 'w-A1', company_id: TENANT_A, is_active: true },
  { id: 'w-A2', company_id: TENANT_A, is_active: true },
  { id: 'w-A3', company_id: TENANT_A, is_active: false },
  // tenant B — 5 active. Should never appear in tenant A's counts.
  { id: 'w-B1', company_id: TENANT_B, is_active: true },
  { id: 'w-B2', company_id: TENANT_B, is_active: true },
  { id: 'w-B3', company_id: TENANT_B, is_active: true },
  { id: 'w-B4', company_id: TENANT_B, is_active: true },
  { id: 'w-B5', company_id: TENANT_B, is_active: true },
];

const sitesFixture: SitesRow[] = [
  { id: 's-A1', company_id: TENANT_A, is_active: true },
  { id: 's-B1', company_id: TENANT_B, is_active: true },
  { id: 's-B2', company_id: TENANT_B, is_active: true },
];

const shiftsFixture: ShiftsRow[] = [
  // tenant A — 1 SUBMITTED (this week), 1 APPROVED (this week)
  { id: 'sh-A1', company_id: TENANT_A, status: 'SUBMITTED', shift_date: '2999-01-02', total_hours: '8.00' },
  { id: 'sh-A2', company_id: TENANT_A, status: 'SUPERVISOR_APPROVED', shift_date: '2999-01-02', total_hours: '7.50' },
  // tenant B — 4 SUBMITTED. Should never inflate tenant A's pending count.
  { id: 'sh-B1', company_id: TENANT_B, status: 'SUBMITTED', shift_date: '2999-01-02', total_hours: '6.00' },
  { id: 'sh-B2', company_id: TENANT_B, status: 'SUBMITTED', shift_date: '2999-01-02', total_hours: '6.00' },
  { id: 'sh-B3', company_id: TENANT_B, status: 'SUBMITTED', shift_date: '2999-01-02', total_hours: '6.00' },
  { id: 'sh-B4', company_id: TENANT_B, status: 'SUBMITTED', shift_date: '2999-01-02', total_hours: '6.00' },
  // ghost tenant — 3 orphan SUBMITTED shifts, mirrors the production
  // finding (a0000000-... had 3 SUBMITTED shifts after company deletion).
  // Must not bleed into either real tenant's count.
  { id: 'sh-G1', company_id: TENANT_GHOST, status: 'SUBMITTED', shift_date: '2999-01-02', total_hours: '5.00' },
  { id: 'sh-G2', company_id: TENANT_GHOST, status: 'SUBMITTED', shift_date: '2999-01-02', total_hours: '5.00' },
  { id: 'sh-G3', company_id: TENANT_GHOST, status: 'SUBMITTED', shift_date: '2999-01-02', total_hours: '5.00' },
];

/**
 * Build a fake Supabase client that supports the chain
 * .from(table).select(...).eq(...).eq(...) and returns counts/data
 * filtered by every accumulated .eq() filter.
 *
 * Critically, this fake records every .eq('company_id', X) call so
 * the test can assert the dashboard query ALWAYS passes a company_id
 * filter — never just .from('shifts').select() with no scope.
 */
function makeFakeSupabase<R>(table: string, fixture: R[]): {
  client: SupabaseClient;
  spy: { eqCalls: Array<[string, unknown]>; companyIdFilters: string[] };
} {
  const eqCalls: Array<[string, unknown]> = [];
  const companyIdFilters: string[] = [];

  function makeQueryBuilder(filters: Array<[string, unknown]>): unknown {
    const apply = () => {
      // Apply every recorded filter.
      const filtered = (fixture as unknown as Array<Record<string, unknown>>)
        .filter((row) =>
          filters.every(([key, value]) => {
            if (key === '__gte') {
              const [col, threshold] = value as [string, unknown];
              return (row[col] as string) >= (threshold as string);
            }
            return row[key] === value;
          }),
        );
      return filtered;
    };

    return {
      eq(col: string, val: unknown) {
        eqCalls.push([col, val]);
        if (col === 'company_id') companyIdFilters.push(val as string);
        return makeQueryBuilder([...filters, [col, val]]);
      },
      gte(col: string, threshold: unknown) {
        return makeQueryBuilder([...filters, ['__gte', [col, threshold]]]);
      },
      // Terminal: when await'd, return { count, data, error }.
      then(resolve: (v: { count: number; data: R[]; error: null }) => void) {
        const data = apply() as unknown as R[];
        resolve({ count: data.length, data, error: null });
      },
    };
  }

  const client = {
    from: vi.fn().mockImplementation((requestedTable: string) => {
      if (requestedTable !== table) {
        // Other tables go to a no-op stub returning empty result.
        return {
          select: () => ({
            eq() { return this; },
            gte() { return this; },
            then(resolve: (v: unknown) => void) {
              resolve({ count: 0, data: [], error: null });
            },
          }),
        };
      }
      return {
        select: () => makeQueryBuilder([]),
      };
    }),
  } as unknown as SupabaseClient;

  return { client, spy: { eqCalls, companyIdFilters } };
}

/**
 * Composite fake client that routes from(table) to the right fixture.
 */
function makeMultiTableSupabase(): {
  client: SupabaseClient;
  spy: { companyIdFilters: string[] };
} {
  const companyIdFilters: string[] = [];

  function builder(rows: Array<Record<string, unknown>>) {
    function chain(filters: Array<[string, unknown]>): unknown {
      const apply = () =>
        rows.filter((row) =>
          filters.every(([key, value]) => {
            if (key === '__gte') {
              const [col, threshold] = value as [string, unknown];
              return (row[col] as string) >= (threshold as string);
            }
            return row[key] === value;
          }),
        );
      return {
        eq(col: string, val: unknown) {
          if (col === 'company_id') companyIdFilters.push(val as string);
          return chain([...filters, [col, val]]);
        },
        gte(col: string, threshold: unknown) {
          return chain([...filters, ['__gte', [col, threshold]]]);
        },
        then(resolve: (v: unknown) => void) {
          const data = apply();
          resolve({ count: data.length, data, error: null });
        },
      };
    }
    return { select: () => chain([]) };
  }

  const client = {
    from: vi.fn().mockImplementation((table: string) => {
      switch (table) {
        case 'workers':
          return builder(workersFixture as unknown as Array<Record<string, unknown>>);
        case 'sites':
          return builder(sitesFixture as unknown as Array<Record<string, unknown>>);
        case 'shifts':
          return builder(shiftsFixture as unknown as Array<Record<string, unknown>>);
        default:
          throw new Error(`unexpected from(${table})`);
      }
    }),
  } as unknown as SupabaseClient;

  return { client, spy: { companyIdFilters } };
}

describe('loadDashboardCounters — tenant isolation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Pin the clock so getWeekStart() returns a deterministic value
    // BEFORE the synthetic shift_date 2999-01-02. Any week-start
    // before 2999-01-02 will let those shifts through; we use today.
    vi.setSystemTime(new Date('2026-04-30T00:00:00Z'));
  });

  it('counts only tenant A workers, sites and pending shifts when admin is in tenant A', async () => {
    const { client, spy } = makeMultiTableSupabase();
    const result = await loadDashboardCounters(client, TENANT_A);

    expect(result.activeWorkers).toBe(2);     // 2 active in A; B not counted
    expect(result.activeSites).toBe(1);        // 1 in A; B not counted
    expect(result.pendingApproval).toBe(1);    // sh-A1; not B's 4, not ghost's 3
    expect(result.weekHours).toBeCloseTo(15.5); // sh-A1 (8) + sh-A2 (7.5)

    // Every count query must have included a company_id filter.
    expect(spy.companyIdFilters.length).toBe(4);
    expect(spy.companyIdFilters.every((id) => id === TENANT_A)).toBe(true);
  });

  it('counts only tenant B workers, sites and pending shifts when admin is in tenant B', async () => {
    const { client, spy } = makeMultiTableSupabase();
    const result = await loadDashboardCounters(client, TENANT_B);

    expect(result.activeWorkers).toBe(5);      // 5 active in B
    expect(result.activeSites).toBe(2);         // 2 in B
    expect(result.pendingApproval).toBe(4);     // 4 SUBMITTED in B; not ghost's 3
    expect(result.weekHours).toBeCloseTo(24);   // 4 × 6h

    expect(spy.companyIdFilters.length).toBe(4);
    expect(spy.companyIdFilters.every((id) => id === TENANT_B)).toBe(true);
  });

  it('orphan shifts on deleted companies never appear in any tenant\'s count', async () => {
    // The 3 ghost shifts (status SUBMITTED, company_id = TENANT_GHOST)
    // mirror the production finding. Neither tenant A nor B should
    // see these in their pending-approval count.
    const { client: clientA } = makeMultiTableSupabase();
    const a = await loadDashboardCounters(clientA, TENANT_A);
    expect(a.pendingApproval).toBe(1);

    const { client: clientB } = makeMultiTableSupabase();
    const b = await loadDashboardCounters(clientB, TENANT_B);
    expect(b.pendingApproval).toBe(4);

    // And — to be very explicit — neither result includes the
    // orphan-tenant total of 3. If scoping ever regresses, this
    // assertion is the canary.
    expect(a.pendingApproval + b.pendingApproval).toBe(5); // 1 + 4, not 5+3=8
  });

  it('an admin in the ghost (deleted) tenant sees only their own orphans, never another tenant\'s data', async () => {
    // Even an admin whose company was deleted shouldn't see other
    // tenants' rows. (In production this admin's getCompanyIdForSession
    // would 403 because their admins row was cascade-deleted with the
    // company; this test pins behaviour for the in-between case.)
    const { client, spy } = makeMultiTableSupabase();
    const result = await loadDashboardCounters(client, TENANT_GHOST);

    expect(result.activeWorkers).toBe(0);    // ghost has no workers
    expect(result.activeSites).toBe(0);
    expect(result.pendingApproval).toBe(3);  // ghost's own 3 orphans
    expect(result.weekHours).toBeCloseTo(15); // 3 × 5h orphans

    expect(spy.companyIdFilters.every((id) => id === TENANT_GHOST)).toBe(true);
  });
});
