// W5/SG-6 — synthetic-failure trace for the FLOS-SHA-001 runner.
//
// Drives the substrate-health cron end-to-end against a mocked
// substrate with a FORCED anchor mismatch and proves the whole alarm
// pipeline fires in order: durable alert row → RED health record →
// Slack ops ping. This is the in-CI version of \"trigger a failure and
// watch the alert land\" — it can never silently rot.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn() },
}));
const { dispatchOpsAlertMock } = vi.hoisted(() => ({
  dispatchOpsAlertMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => supabaseMock,
}));
vi.mock('@/lib/observability/ops-alert', () => ({
  dispatchOpsAlert: dispatchOpsAlertMock,
}));
vi.mock('@/lib/logger', () => ({
  routeLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { GET } from './route';

const GREEN_ANCHOR = {
  id: 'FROZEN_ANCHOR_V0',
  scope_text: 'scope',
  expected_fingerprint: 'aa',
  expected_count: 32,
  bound_at: '2026-06-04T02:56:50Z',
  actual_fingerprint: 'aa',
  actual_count: 32,
  matches: true,
  recomputed_at: '2026-06-11T00:00:00Z',
};

interface Capture {
  healthRows: Array<Record<string, unknown>>;
  alertRows: Array<Record<string, unknown>>;
}

function setup(opts: {
  anchors?: Array<Record<string, unknown>>;
  twilioDead?: Array<Record<string, unknown>>;
  stripeDead?: Array<Record<string, unknown>>;
  notifDead?: Array<Record<string, unknown>>;
  authDead?: Array<Record<string, unknown>>;
  advisorFindings?: Array<Record<string, unknown>>;
  recentHealth?: Array<Record<string, unknown>>;
  lastChainRunAt?: string | null;
  failNotifHealthInsert?: boolean;
  commitOrphans?: Array<Record<string, unknown>>;
}): Capture {
  const cap: Capture = { healthRows: [], alertRows: [] };
  const thenable = (result: { data?: unknown; error?: unknown | null }) => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'lt', 'order', 'limit']) {
      c[m] = vi.fn(() => c);
    }
    c['maybeSingle'] = vi.fn(() => Promise.resolve(result));
    c['then'] = (res: (v: typeof result) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej);
    return c;
  };
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'v_anchor_verification') {
      return thenable({ data: opts.anchors ?? [GREEN_ANCHOR], error: null });
    }
    if (table === 'admin_access_log') {
      return {
        insert: vi.fn((rows: Array<Record<string, unknown>>) => {
          cap.alertRows.push(...rows);
          return Promise.resolve({ error: null });
        }),
      };
    }
    if (table === 'webhook_idempotency') {
      // Twilio and supabase-auth both read this table; route by source arg.
      let src = '';
      const c: Record<string, unknown> = {};
      c['select'] = vi.fn(() => c);
      c['eq'] = vi.fn((col: string, val: string) => {
        if (col === 'source') src = val;
        return c;
      });
      c['is'] = vi.fn(() => c);
      c['lt'] = vi.fn(() => c);
      c['limit'] = vi.fn(() => c);
      c['then'] = (res: (v: { data: unknown; error: null }) => unknown, rej?: (e: unknown) => unknown) => {
        const data = src === 'supabase-auth' ? opts.authDead ?? [] : opts.twilioDead ?? [];
        return Promise.resolve({ data, error: null }).then(res, rej);
      };
      return c;
    }
    if (table === 'stripe_event_log') {
      return thenable({ data: opts.stripeDead ?? [], error: null });
    }
    if (table === 'notification_dead_letter') {
      // B4/SG-5 — outbound dead-letter check reads unreplayed rows.
      return thenable({ data: opts.notifDead ?? [], error: null });
    }
    if (table === 'v_security_advisor_sweep') {
      return thenable({ data: opts.advisorFindings ?? [], error: null });
    }
    if (table === 'v_shift_commit_orphans') {
      // WLES-6 — shifts in the approvable/payable window lacking a SHIFT_COMMIT.
      return thenable({ data: opts.commitOrphans ?? [], error: null });
    }
    if (table === 'substrate_health_log') {
      // Three shapes on this table: cron_health read (.maybeSingle -> single
      // row), error_rate read (.gte/.lt then -> array), and inserts.
      const c: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is', 'lt', 'gte', 'order', 'limit']) {
        c[m] = vi.fn(() => c);
      }
      c['maybeSingle'] = vi.fn(() =>
        Promise.resolve({
          data:
            opts.lastChainRunAt === null
              ? null
              : { run_at: opts.lastChainRunAt ?? new Date().toISOString(), status: 'GREEN' },
          error: null,
        }),
      );
      c['then'] = (res: (v: { data: unknown; error: null }) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve({ data: opts.recentHealth ?? [], error: null }).then(res, rej);
      c['insert'] = vi.fn((row: Record<string, unknown>) => {
        if (opts.failNotifHealthInsert && row.check_name === 'notification_outbound') {
          return Promise.resolve({ error: { message: 'violates check constraint' } });
        }
        cap.healthRows.push(row);
        return Promise.resolve({ error: null });
      });
      return c;
    }
    throw new Error(`unexpected from(${table})`);
  });
  return cap;
}

function req() {
  return new Request('http://test/api/cron/substrate-health', {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'cron-test-secret';
});

describe('substrate-health — synthetic-failure trace (the alarm fires)', () => {
  it('a tampered anchor produces: alert row → RED record → Slack ping, in order', async () => {
    const cap = setup({
      anchors: [{ ...GREEN_ANCHOR, actual_fingerprint: 'bb', matches: false }],
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; status: string };
    expect(body.ok).toBe(false);
    expect(body.status).toBe('RED');

    // 1. Durable alert row, anchor id in reason_code.
    expect(cap.alertRows).toHaveLength(1);
    expect(cap.alertRows[0].reason_code).toBe('ANCHOR_MISMATCH:FROZEN_ANCHOR_V0');

    // 2. RED health record with the recomputed detail.
    const anchorRow = cap.healthRows.find((r) => r.check_name === 'anchor_fingerprint');
    expect(anchorRow?.status).toBe('RED');

    // 3. Human ping fired with the runbook pointer.
    expect(dispatchOpsAlertMock).toHaveBeenCalledTimes(1);
    const [title, lines] = dispatchOpsAlertMock.mock.calls[0] as [string, string[]];
    expect(title).toMatch(/RED/);
    expect(lines.join(' ')).toMatch(/anchor_fingerprint: RED/);
    expect(lines.join(' ')).toMatch(/incident-runbook/);
  });

  it('all-green run records nine GREEN checks and stays silent', async () => {
    const cap = setup({});
    const res = await GET(req());
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(cap.alertRows).toHaveLength(0);
    const names = cap.healthRows.map((r) => r.check_name).sort();
    expect(names).toEqual([
      'advisor_sweep',
      'anchor_fingerprint',
      'cron_health',
      'error_rate',
      'notification_outbound',
      'shift_commit_completeness',
      'webhook_delivery_stripe',
      'webhook_delivery_supabase_auth',
      'webhook_delivery_twilio',
    ]);
    expect(cap.healthRows.every((r) => r.status === 'GREEN')).toBe(true);
    expect(dispatchOpsAlertMock).not.toHaveBeenCalled();
  });

  it('a shift missing its SHIFT_COMMIT surfaces RED (WLES-6)', async () => {
    const cap = setup({
      commitOrphans: [{ shift_id: 'aaaaaaaa-0000-4000-8000-000000000009', status: 'PAYROLL_APPROVED' }],
    });
    const res = await GET(req());
    const body = (await res.json()) as { ok: boolean; shift_commit_completeness: string; shift_commit_orphans: number };
    expect(body.shift_commit_completeness).toBe('RED');
    expect(body.shift_commit_orphans).toBe(1);
    expect(body.ok).toBe(false);
    // durable alert row with the missing-commit reason + the human ping
    expect(cap.alertRows.some((r) => String(r.reason_code).startsWith('SHIFT_COMMIT_MISSING'))).toBe(true);
    expect(dispatchOpsAlertMock).toHaveBeenCalled();
  });

  it('the seed/pilot baseline orphan does NOT trip the alarm (WLES-6)', async () => {
    const cap = setup({
      commitOrphans: [{ shift_id: '99999999-9999-4999-8999-999999999992', status: 'EXPORTED' }],
    });
    const res = await GET(req());
    const body = (await res.json()) as { shift_commit_completeness: string; shift_commit_orphans: number };
    expect(body.shift_commit_completeness).toBe('GREEN');
    expect(body.shift_commit_orphans).toBe(0);
    expect(cap.alertRows).toHaveLength(0);
  });

  it('a stale chain alarm goes RED on cron_health (the alarm watches itself)', async () => {
    setup({ lastChainRunAt: '2026-06-01T00:00:00Z' });
    const res = await GET(req());
    const body = (await res.json()) as { ok: boolean; cron_health: string };
    expect(body.cron_health).toBe('RED');
    expect(body.ok).toBe(false);
    expect(dispatchOpsAlertMock).toHaveBeenCalled();
  });

  it('twilio dead letters surface RED with the row keys', async () => {
    setup({ twilioDead: [{ key: 'SMdead1', route: '/api/webhooks/twilio/sms-reply', first_seen_at: '2026-06-10T00:00:00Z' }] });
    const res = await GET(req());
    const body = (await res.json()) as { ok: boolean; webhook_delivery_twilio: string; dead_letters: number };
    expect(body.webhook_delivery_twilio).toBe('RED');
    expect(body.dead_letters).toBe(1);
    expect(body.ok).toBe(false);
  });

  it('outbound notification dead letters surface RED (B4/SG-5)', async () => {
    setup({ notifDead: [{ id: 'dl-1', channel: 'twilio_sms', created_at: '2026-06-12T00:00:00Z' }] });
    const res = await GET(req());
    const body = (await res.json()) as {
      ok: boolean;
      notification_outbound: string;
      notification_dead_letters: number;
    };
    expect(body.notification_outbound).toBe('RED');
    expect(body.notification_dead_letters).toBe(1);
    expect(body.ok).toBe(false);
    expect(dispatchOpsAlertMock).toHaveBeenCalled();
  });

  it('a failing notification health insert cannot silence cron_health (B4b)', async () => {
    const cap = setup({ failNotifHealthInsert: true });
    const res = await GET(req());
    expect(res.status).toBe(200);
    const names = cap.healthRows.map((r) => r.check_name);
    expect(names).toContain('cron_health');
    const body = (await res.json()) as { notification_outbound: string };
    expect(body.notification_outbound).toBe('ERROR');
  });

  it('supabase-auth dead letters surface RED (webhook_delivery_supabase_auth)', async () => {
    setup({ authDead: [{ key: 'AUTHdead1', route: '/api/webhooks/supabase-auth', first_seen_at: '2026-06-10T00:00:00Z' }] });
    const res = await GET(req());
    const body = (await res.json()) as { ok: boolean; webhook_delivery_supabase_auth: string; supabase_auth_dead_letters: number };
    expect(body.webhook_delivery_supabase_auth).toBe('RED');
    expect(body.supabase_auth_dead_letters).toBe(1);
    expect(body.ok).toBe(false);
    expect(dispatchOpsAlertMock).toHaveBeenCalled();
  });

  it('a structural-security finding surfaces RED (advisor_sweep)', async () => {
    setup({ advisorFindings: [{ finding: 'rls_disabled', object_name: 'some_table' }] });
    const res = await GET(req());
    const body = (await res.json()) as { ok: boolean; advisor_sweep: string; advisor_findings: number };
    expect(body.advisor_sweep).toBe('RED');
    expect(body.advisor_findings).toBe(1);
    expect(body.ok).toBe(false);
    expect(dispatchOpsAlertMock).toHaveBeenCalled();
  });

  it('an ERROR-class outcome in the trailing window surfaces RED (error_rate)', async () => {
    setup({ recentHealth: [{ status: 'ERROR' }, { status: 'GREEN' }] });
    const res = await GET(req());
    const body = (await res.json()) as { ok: boolean; error_rate: string };
    expect(body.error_rate).toBe('RED');
    expect(body.ok).toBe(false);
    expect(dispatchOpsAlertMock).toHaveBeenCalled();
  });

  it('rejects without the CRON_SECRET bearer', async () => {
    const res = await GET(new Request('http://test/api/cron/substrate-health'));
    expect(res.status).toBe(401);
  });
});
