// B5 — live end-to-end alert path test. Gated behind RUN_LIVE_B5=1
// so CI never fires it. Use:
//   RUN_LIVE_B5=1 node_modules/.bin/vitest run src/lib/wles/chain-verify.live.test.ts

import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'crypto';
import { readFileSync } from 'fs';

import { verifyCompanyChain, type ShiftEventRow } from './chain-verify';
import { notifyChainIntegrityAlert } from '../email/notify';

// Hydrate env from .env.local if caller didn't.
try {
  const raw = readFileSync('.env.local', 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
} catch {
  // ignore
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SYSTEM_USER_UUID = '00000000-0000-0000-0000-000000000000';

const gated = process.env.RUN_LIVE_B5 === '1';

function computeHash(ev: {
  company_id: string;
  worker_id: string;
  site_id: string;
  event_type: string;
  event_data: Record<string, unknown>;
  created_at: Date;
}): string {
  return createHash('sha256')
    .update(
      [
        ev.company_id,
        ev.worker_id,
        ev.site_id,
        ev.event_type,
        JSON.stringify(ev.event_data),
        ev.created_at.toISOString(),
      ].join('|'),
    )
    .digest('hex');
}

describe.skipIf(!gated)('B5 live alert-path (production)', () => {
  it(
    'detects tampered hash, writes alert row, dispatches email, reverts test data',
    async () => {
      if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('env missing');
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const workerId = randomUUID();
      const siteId = randomUUID();
      const baseTime = Date.now();

      // Build a 3-event chain with company_id=NULL (hashed as empty string).
      const rebuilt: Array<Record<string, unknown>> = [];
      let prev: string | null = null;
      for (let i = 0; i < 3; i++) {
        const id = randomUUID();
        const created_at = new Date(baseTime + i * 60_000);
        const event_type = i === 0 ? 'START_EVENT' : i === 1 ? 'END_EVENT' : 'SHIFT_COMMIT';
        const event_data = { note: `b5-test-${i}`, synthetic: true };
        const correctHash = computeHash({
          company_id: '',
          worker_id: workerId,
          site_id: siteId,
          event_type,
          event_data,
          created_at,
        });
        const isTampered = i === 1;
        const event_hash = isTampered
          ? 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
          : correctHash;
        rebuilt.push({
          id,
          company_id: null,
          worker_id: workerId,
          site_id: siteId,
          event_type,
          event_data,
          event_hash,
          previous_event_hash: prev,
          created_at: created_at.toISOString(),
          created_by: 'B5_HARDENING_TEST',
        });
        prev = event_hash;
      }
      const ids = rebuilt.map((r) => r.id as string);

      // INSERT synthetic rows.
      const { error: insErr } = await supabase.from('shift_events').insert(rebuilt);
      expect(insErr, `insert error: ${insErr?.message}`).toBeNull();

      try {
        // FETCH back.
        const { data: fetched, error: fetchErr } = await supabase
          .from('shift_events')
          .select(
            'id, company_id, worker_id, site_id, event_type, event_data, event_hash, previous_event_hash, created_at',
          )
          .in('id', ids)
          .order('created_at', { ascending: true });
        expect(fetchErr).toBeNull();
        expect(fetched).toHaveLength(3);

        // VERIFY — expect at least SELF_HASH_MISMATCH on the tampered event.
        const report = verifyCompanyChain(fetched as ShiftEventRow[]);
        expect(report.ok).toBe(false);
        expect(report.events_scanned).toBe(3);
        expect(report.mismatches.length).toBeGreaterThanOrEqual(1);
        const reasons = report.mismatches.map((m) => m.reason);
        expect(reasons).toContain('SELF_HASH_MISMATCH');
        console.log('  detected mismatches:', report.mismatches.length, reasons);

        // ALERT ROW — permanent audit record in admin_access_log.
        const alertRows = report.mismatches.map((m) => ({
          admin_user_id: SYSTEM_USER_UUID,
          customer_id_accessed: null,
          resource_type: 'shift_events',
          resource_id: m.event_id,
          action: 'alert',
          reason_code: `CHAIN_BREAK:${m.reason}:B5_TEST`,
          source_ip: null,
        }));
        const { error: alertErr } = await supabase
          .from('admin_access_log')
          .insert(alertRows);
        expect(alertErr, `alert insert error: ${alertErr?.message}`).toBeNull();
        console.log('  alert rows inserted:', alertRows.length);

        // EMAIL — real dispatch.
        const scanStartedAt = new Date().toISOString();
        const scanFinishedAt = new Date().toISOString();
        await notifyChainIntegrityAlert({
          companiesScanned: 1,
          eventsScanned: report.events_scanned,
          mismatches: report.mismatches.map((m) => ({
            company_id: m.company_id,
            event_id: m.event_id,
            event_type: m.event_type,
            reason: m.reason + ' [B5_TEST]',
            expected: m.expected,
            actual: m.actual,
            created_at: m.created_at,
          })),
          scanStartedAt,
          scanFinishedAt,
        });
        console.log('  Resend email dispatched OK');
      } finally {
        // REVERT — delete synthetic shift_events rows.
        const { error: delErr, count } = await supabase
          .from('shift_events')
          .delete({ count: 'exact' })
          .in('id', ids);
        expect(delErr, `cleanup delete error: ${delErr?.message}`).toBeNull();
        console.log('  reverted shift_events rows:', count);
      }
    },
    45_000,
  );
});
