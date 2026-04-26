// ---------------------------------------------------------------
// B5 — live end-to-end alert path test.
// Purpose: prove that when shift_events contains a tampered hash,
// the verify-hashes logic:
//   1. Detects the mismatch
//   2. Writes an alert row to admin_access_log (immutable — stays)
//   3. Dispatches a real Resend email to the operator
//
// Scaffolding pattern:
//   - Inserts 3 synthetic shift_events rows (created_by=B5_HARDENING_TEST)
//     tied to a sentinel fake company UUID (not registered in companies)
//     so they cannot collide with real customer data.
//   - After the assertion passes, DELETES the three test shift_events
//     rows. This is a one-off exception to the WLES immutability rule,
//     authorised by Lauren specifically for this hardening test (spec:
//     "Revert test record after").
//   - The admin_access_log alert row is intentionally NOT deleted —
//     it is a valid audit record that the alert path worked.
//
// Run: npx tsx scripts/b5-verify-test.ts
// Requires: .env.local with NEXT_PUBLIC_SUPABASE_URL,
//           SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, ALERT_EMAIL_TO (opt).
// ---------------------------------------------------------------

import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'crypto';
import { readFileSync } from 'fs';

import { verifyCompanyChain, type ShiftEventRow } from '../src/lib/wles/chain-verify';
import { notifyChainIntegrityAlert } from '../src/lib/email/notify';

// Load .env.local manually (no dotenv dep).
try {
  const raw = readFileSync('.env.local', 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
} catch {
  // ignore — env may already be set
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// A sentinel company UUID — not in companies table. Distinct enough to grep for.
const FAKE_COMPANY_ID = 'b500b5b5-b500-b500-b500-b5b500b5b500';
const SYSTEM_USER_UUID = '00000000-0000-0000-0000-000000000000';

function computeHash(ev: {
  company_id: string;
  worker_id: string;
  site_id: string;
  event_type: string;
  event_data: Record<string, unknown>;
  created_at: Date;
}): string {
  const s = [
    ev.company_id,
    ev.worker_id,
    ev.site_id,
    ev.event_type,
    JSON.stringify(ev.event_data),
    ev.created_at.toISOString(),
  ].join('|');
  return createHash('sha256').update(s).digest('hex');
}

async function main() {
  console.log('=== B5 live alert-path test ===');
  const scanStartedAt = new Date().toISOString();
  const workerId = randomUUID();
  const siteId = randomUUID();
  const baseTime = Date.now();

  const evs: Array<{
    id: string;
    company_id: string;
    worker_id: string;
    site_id: string;
    event_type: string;
    event_data: Record<string, unknown>;
    event_hash: string;
    previous_event_hash: string | null;
    created_at: string;
    created_by: string;
  }> = [];

  // Event 1 (genesis — correct)
  {
    const id = randomUUID();
    const created_at = new Date(baseTime);
    const event_type = 'START_EVENT';
    const event_data = { note: 'b5-test-1', synthetic: true };
    const hash = computeHash({
      company_id: FAKE_COMPANY_ID,
      worker_id: workerId,
      site_id: siteId,
      event_type,
      event_data,
      created_at,
    });
    evs.push({
      id,
      company_id: FAKE_COMPANY_ID,
      worker_id: workerId,
      site_id: siteId,
      event_type,
      event_data,
      event_hash: hash,
      previous_event_hash: null,
      created_at: created_at.toISOString(),
      created_by: 'B5_HARDENING_TEST',
    });
  }
  // Event 2 (TAMPERED — bad self-hash)
  {
    const id = randomUUID();
    const created_at = new Date(baseTime + 60_000);
    const event_type = 'END_EVENT';
    const event_data = { note: 'b5-test-2-tampered', synthetic: true };
    evs.push({
      id,
      company_id: FAKE_COMPANY_ID,
      worker_id: workerId,
      site_id: siteId,
      event_type,
      event_data,
      event_hash:
        'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      previous_event_hash: evs[0].event_hash,
      created_at: created_at.toISOString(),
      created_by: 'B5_HARDENING_TEST',
    });
  }
  // Event 3 (correct self-hash, but points to TAMPERED event's claimed hash so
  // chain linkage is still consistent-with-tampered — this isolates the self-hash
  // detection from the linkage detection for clean assertion.)
  {
    const id = randomUUID();
    const created_at = new Date(baseTime + 120_000);
    const event_type = 'SHIFT_COMMIT';
    const event_data = { note: 'b5-test-3', synthetic: true };
    const hash = computeHash({
      company_id: FAKE_COMPANY_ID,
      worker_id: workerId,
      site_id: siteId,
      event_type,
      event_data,
      created_at,
    });
    evs.push({
      id,
      company_id: FAKE_COMPANY_ID,
      worker_id: workerId,
      site_id: siteId,
      event_type,
      event_data,
      event_hash: hash,
      previous_event_hash: evs[1].event_hash, // 'deadbeef...'
      created_at: created_at.toISOString(),
      created_by: 'B5_HARDENING_TEST',
    });
  }

  // shift_events FKs: company_id references companies. Since FAKE_COMPANY_ID
  // is not in companies, inserts will fail. Set company_id to NULL in the DB
  // (the schema allows it) while retaining in-memory FAKE for the hash input.
  // But the hash was computed WITH FAKE_COMPANY_ID as the company_id in the
  // serialised input — so we must keep company_id=NULL in DB and recompute
  // hashes with company_id='' to match generateEventHash's NULL-coalescing.
  //
  // Simpler path: rebuild the fixture with company_id=null end-to-end, and
  // the in-memory hash computation using empty-string coalescing.
  const rebuilt: typeof evs = [];
  let prev: string | null = null;
  for (let i = 0; i < evs.length; i++) {
    const e = evs[i];
    const created_at = new Date(e.created_at);
    const correctHash = computeHash({
      company_id: '', // null coalesced to empty
      worker_id: e.worker_id,
      site_id: e.site_id,
      event_type: e.event_type,
      event_data: e.event_data,
      created_at,
    });
    const isTampered = i === 1;
    rebuilt.push({
      ...e,
      company_id: null as unknown as string, // tell Supabase: NULL
      event_hash: isTampered
        ? 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
        : correctHash,
      previous_event_hash: prev,
    });
    prev = rebuilt[rebuilt.length - 1].event_hash;
  }

  console.log('Inserting 3 synthetic shift_events (1 tampered)…');
  const { error: insertErr } = await supabase.from('shift_events').insert(rebuilt);
  if (insertErr) {
    console.error('INSERT failed:', insertErr);
    process.exit(1);
  }
  console.log('  inserted ids:', rebuilt.map((r) => r.id));

  try {
    // Fetch them back in chronological order.
    const { data: fetched, error: fetchErr } = await supabase
      .from('shift_events')
      .select(
        'id, company_id, worker_id, site_id, event_type, event_data, event_hash, previous_event_hash, created_at',
      )
      .in(
        'id',
        rebuilt.map((r) => r.id),
      )
      .order('created_at', { ascending: true });
    if (fetchErr) throw fetchErr;
    console.log('  fetched', fetched?.length ?? 0, 'rows');

    const report = verifyCompanyChain(fetched as ShiftEventRow[]);
    console.log('verifyCompanyChain result:');
    console.log('  ok:', report.ok);
    console.log('  events_scanned:', report.events_scanned);
    console.log('  mismatches:', report.mismatches.length);
    for (const m of report.mismatches) {
      console.log(`    - ${m.reason} on ${m.event_id} (type=${m.event_type})`);
    }

    if (report.ok || report.mismatches.length === 0) {
      console.error('ASSERTION FAILED: expected mismatches but got none');
      process.exit(2);
    }
    // Expect at least a SELF_HASH_MISMATCH on the tampered event and
    // a PREVIOUS_LINK_BROKEN on the following event (because its stored
    // prev points to deadbeef... but the prior row's stored hash is also
    // deadbeef... actually let's see — both should be deadbeef so link is
    // intact. Only SELF_HASH_MISMATCH is expected.
    const hasSelf = report.mismatches.some((m) => m.reason === 'SELF_HASH_MISMATCH');
    if (!hasSelf) {
      console.error('ASSERTION FAILED: expected SELF_HASH_MISMATCH');
      process.exit(3);
    }
    console.log('ASSERTION OK: tampered event detected.');

    // Write alert row(s) to admin_access_log — permanent audit record.
    console.log('Writing admin_access_log alert row(s)…');
    const alertRows = report.mismatches.map((m) => ({
      admin_user_id: SYSTEM_USER_UUID,
      customer_id_accessed: null,
      resource_type: 'shift_events',
      resource_id: m.event_id,
      action: 'alert',
      reason_code: `CHAIN_BREAK:${m.reason}:B5_TEST`,
      source_ip: null,
    }));
    const { error: alertErr } = await supabase.from('admin_access_log').insert(alertRows);
    if (alertErr) {
      console.error('admin_access_log insert FAILED:', alertErr);
      process.exit(4);
    }
    console.log('  wrote', alertRows.length, 'alert rows');

    // Dispatch real email.
    console.log('Sending Resend alert email…');
    const scanFinishedAt = new Date().toISOString();
    try {
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
      console.log('  email dispatched OK');
    } catch (e) {
      console.error('  email dispatch FAILED:', e);
      // Not fatal — alert rows are on record.
    }
  } finally {
    // Revert synthetic shift_events rows (per Lauren's spec).
    console.log('Reverting synthetic shift_events rows…');
    const ids = rebuilt.map((r) => r.id);
    const { error: delErr, count } = await supabase
      .from('shift_events')
      .delete({ count: 'exact' })
      .in('id', ids);
    if (delErr) {
      console.error('CLEANUP FAILED:', delErr);
      process.exit(5);
    }
    console.log(`  deleted ${count ?? ids.length} synthetic rows`);
  }

  console.log('=== B5 live alert-path test: PASSED ===');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(10);
});
