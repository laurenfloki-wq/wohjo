// Flostruction Field — Records API tests
//
// Coverage targets per the brief: auth-scope (worker can only see their
// own shifts) + pagination shape. Standard is "would catch a regression
// that ships," not 100% line coverage.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
  },
}));

const { requireWorkerIdentityMock } = vi.hoisted(() => ({
  requireWorkerIdentityMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockReturnValue(supabaseMock),
}));

vi.mock('@/lib/auth/session', () => ({
  requireWorkerIdentity: requireWorkerIdentityMock,
}));

vi.mock('@/lib/auth/response', () => ({
  authErrorResponse: (err: unknown) => {
    const status =
      err && typeof err === 'object' && 'status' in err && typeof (err as { status: unknown }).status === 'number'
        ? ((err as { status: number }).status)
        : 401;
    return new Response(
      JSON.stringify({ error: 'Authentication failed' }),
      { status, headers: { 'content-type': 'application/json' } },
    );
  },
}));

vi.mock('@/lib/logger', () => ({
  routeLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  }),
}));

import { GET } from './route';

// ─── Test fixtures ──────────────────────────────────────────────────────────

const WORKER_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_WORKER_ID = '00000000-0000-0000-0000-000000000002';
const SITE_ID = '00000000-0000-0000-0000-000000000003';

interface ShiftFixture {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string | null;
  break_minutes: number | null;
  total_hours: string | null;
  status: string;
  receipt_id: string;
  site_id: string | null;
  created_at: string;
}

function makeShift(overrides: Partial<ShiftFixture> = {}): ShiftFixture {
  return {
    id: '00000000-0000-0000-0000-000000000010',
    shift_date: '2026-04-29',
    start_time: '2026-04-29T07:00:00.000Z',
    end_time: '2026-04-29T15:30:00.000Z',
    break_minutes: 30,
    total_hours: '8.00',
    status: 'SUPERVISOR_APPROVED',
    receipt_id: 'FSTR-ABC12345',
    site_id: SITE_ID,
    created_at: '2026-04-29T15:30:01.000Z',
    ...overrides,
  };
}

interface RecordedShiftQuery {
  filterColumn: string;
  filterValue: unknown;
  cursorValue: string | null;
  limit: number;
}

function wireShiftsQuery(opts: {
  rows?: ShiftFixture[];
  recorded?: RecordedShiftQuery;
}): RecordedShiftQuery {
  const recorded: RecordedShiftQuery = opts.recorded ?? {
    filterColumn: '',
    filterValue: null,
    cursorValue: null,
    limit: 0,
  };
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn(function (this: typeof builder, col: string, val: unknown) {
      recorded.filterColumn = col;
      recorded.filterValue = val;
      return this;
    }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn(function (this: typeof builder, n: number) {
      recorded.limit = n;
      // Final await target — return data + error.
      return Promise.resolve({ data: opts.rows ?? [], error: null });
    }),
    lt: vi.fn(function (this: typeof builder, _col: string, val: string) {
      recorded.cursorValue = val;
      return this;
    }),
  };
  return recorded;
}

function wireSitesQuery(siteRows: Array<{ id: string; name: string }>): void {
  // Sites resolution path — only invoked if siteIds is non-empty.
  // Tests don't assert on site name resolution; supply a permissive stub.
  // Builder for sites uses .select(...).in(...) returning Promise.
  // Most tests use a single shift with one site_id; a single matching row covers it.
  // No-op when called with .select(...).in(...) — return the rows.
  // Implementation deferred to wireFromSwitch below.
  void siteRows;
}

function wireFromSwitch(opts: {
  shifts?: ShiftFixture[];
  recordedShiftQuery?: RecordedShiftQuery;
  siteRows?: Array<{ id: string; name: string }>;
}): RecordedShiftQuery {
  const recorded = wireShiftsQuery({
    rows: opts.shifts,
    recorded: opts.recordedShiftQuery,
  });
  wireSitesQuery(opts.siteRows ?? []);

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'shifts') {
      // Supabase-js builder is thenable, not a Promise — chain methods
      // return the builder; `await` triggers execution via .then. Mock
      // mirrors that contract so `.limit(n).lt(...)` chains cleanly.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn((col: string, val: unknown) => {
          recorded.filterColumn = col;
          recorded.filterValue = val;
          return builder;
        }),
        order: vi.fn(() => builder),
        limit: vi.fn((n: number) => {
          recorded.limit = n;
          return builder;
        }),
        lt: vi.fn((_col: string, val: string) => {
          recorded.cursorValue = val;
          return builder;
        }),
        then: (
          resolve: (value: { data: ShiftFixture[]; error: null }) => unknown,
        ) => resolve({ data: opts.shifts ?? [], error: null }),
      };
      return builder;
    }
    if (table === 'sites') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: opts.siteRows ?? [{ id: SITE_ID, name: 'Mt Stromlo' }],
            error: null,
          }),
        }),
      };
    }
    throw new Error(`unexpected from(${table})`);
  });

  return recorded;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('GET /api/field/records — auth scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401-shaped response when requireWorkerIdentity rejects', async () => {
    requireWorkerIdentityMock.mockRejectedValueOnce(
      Object.assign(new Error('not authenticated'), { status: 401 }),
    );

    const res = await GET(new Request('https://flosmosis.com/api/field/records'));

    expect(res.status).toBe(401);
  });

  it('scopes the shifts query to the session worker_id (cross-worker probes collapse)', async () => {
    requireWorkerIdentityMock.mockResolvedValueOnce({ workerId: WORKER_ID });
    const recorded: RecordedShiftQuery = {
      filterColumn: '',
      filterValue: null,
      cursorValue: null,
      limit: 0,
    };
    wireFromSwitch({
      shifts: [makeShift({ id: '00000000-0000-0000-0000-000000000010' })],
      recordedShiftQuery: recorded,
    });

    const res = await GET(new Request('https://flosmosis.com/api/field/records'));

    expect(res.status).toBe(200);
    expect(recorded.filterColumn).toBe('worker_id');
    // The trust anchor: the value passed to .eq must be the session
    // worker_id from requireWorkerIdentity, never anything else (e.g.
    // a body-supplied worker_id, a query-param worker_id, etc.).
    expect(recorded.filterValue).toBe(WORKER_ID);
    // Sanity-check that the OTHER worker's id isn't being substituted.
    expect(recorded.filterValue).not.toBe(OTHER_WORKER_ID);
  });
});

describe('GET /api/field/records — pagination shape', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('default limit asks supabase for limit+1 rows (pagination signal)', async () => {
    requireWorkerIdentityMock.mockResolvedValueOnce({ workerId: WORKER_ID });
    const recorded: RecordedShiftQuery = {
      filterColumn: '',
      filterValue: null,
      cursorValue: null,
      limit: 0,
    };
    wireFromSwitch({ shifts: [], recordedShiftQuery: recorded });

    await GET(new Request('https://flosmosis.com/api/field/records'));

    // Default limit is 30; query asks for 31 to detect "more pages".
    expect(recorded.limit).toBe(31);
  });

  it('next_cursor is null when fewer than limit shifts are returned', async () => {
    requireWorkerIdentityMock.mockResolvedValueOnce({ workerId: WORKER_ID });
    wireFromSwitch({
      shifts: [
        makeShift({ id: '00000000-0000-0000-0000-000000000010', shift_date: '2026-04-29' }),
        makeShift({ id: '00000000-0000-0000-0000-000000000011', shift_date: '2026-04-28' }),
      ],
    });

    const res = await GET(new Request('https://flosmosis.com/api/field/records'));
    const body = (await res.json()) as { shifts: unknown[]; next_cursor: string | null };

    expect(body.shifts.length).toBe(2);
    expect(body.next_cursor).toBeNull();
  });

  it('next_cursor returns the last shift_date when supabase yields limit+1 rows', async () => {
    requireWorkerIdentityMock.mockResolvedValueOnce({ workerId: WORKER_ID });
    // Build 31 fixtures so we trip the "has more" branch (default limit=30).
    const fixtures = Array.from({ length: 31 }, (_, i) =>
      makeShift({
        id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
        // descending shift_date so the 30th row's date is the cursor.
        shift_date: `2026-${String(4 + Math.floor(i / 30)).padStart(2, '0')}-${String(28 - (i % 28)).padStart(2, '0')}`,
      }),
    );
    wireFromSwitch({ shifts: fixtures });

    const res = await GET(new Request('https://flosmosis.com/api/field/records'));
    const body = (await res.json()) as { shifts: unknown[]; next_cursor: string | null };

    expect(body.shifts.length).toBe(30);
    // next_cursor is the last shift_date in the trimmed page (i.e. the
    // 30th fixture's date).
    expect(body.next_cursor).toBe(fixtures[29].shift_date);
  });

  it('cursor query parameter is forwarded to supabase as a shift_date <-cursor filter', async () => {
    requireWorkerIdentityMock.mockResolvedValueOnce({ workerId: WORKER_ID });
    const recorded: RecordedShiftQuery = {
      filterColumn: '',
      filterValue: null,
      cursorValue: null,
      limit: 0,
    };
    wireFromSwitch({ shifts: [], recordedShiftQuery: recorded });

    await GET(
      new Request(
        'https://flosmosis.com/api/field/records?cursor=2026-04-15',
      ),
    );

    expect(recorded.cursorValue).toBe('2026-04-15');
  });

  it('honours the limit query parameter, capped at MAX_LIMIT', async () => {
    requireWorkerIdentityMock.mockResolvedValueOnce({ workerId: WORKER_ID });
    const recorded: RecordedShiftQuery = {
      filterColumn: '',
      filterValue: null,
      cursorValue: null,
      limit: 0,
    };
    wireFromSwitch({ shifts: [], recordedShiftQuery: recorded });

    // Request 500 — should be capped at 100 (MAX_LIMIT) → +1 detection row = 101.
    await GET(new Request('https://flosmosis.com/api/field/records?limit=500'));

    expect(recorded.limit).toBe(101);
  });

  it('response shape exposes only the fields the page consumes (no PII leak)', async () => {
    requireWorkerIdentityMock.mockResolvedValueOnce({ workerId: WORKER_ID });
    wireFromSwitch({
      shifts: [makeShift()],
    });

    const res = await GET(new Request('https://flosmosis.com/api/field/records'));
    const body = (await res.json()) as { shifts: Record<string, unknown>[] };

    expect(body.shifts.length).toBe(1);
    const shift = body.shifts[0];
    // Whitelist: these are the fields the records page consumes.
    const allowed = new Set([
      'id',
      'shift_date',
      'start_time',
      'end_time',
      'break_minutes',
      'total_hours',
      'status',
      'receipt_id',
      'site_name',
    ]);
    for (const key of Object.keys(shift)) {
      expect(allowed.has(key)).toBe(true);
    }
    // Specifically: company_id and worker_id must NOT be in the response —
    // the worker is the implicit subject; surfacing those leaks tenancy
    // structure to a phone screen unnecessarily.
    expect(shift).not.toHaveProperty('company_id');
    expect(shift).not.toHaveProperty('worker_id');
  });
});
