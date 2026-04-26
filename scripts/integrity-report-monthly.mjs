#!/usr/bin/env node
// ---------------------------------------------------------------------
// L3.7(a) — Monthly cryptographic chain integrity report generator
//
// Produces FLOSMOSIS/operations/integrity-reports/YYYY-MM.md for the
// given period (defaults to the previous calendar month, UTC).
//
// Reads:
//   shift_events (count by event_type; chain segment for verifier pass)
//   shifts       (anomaly_flags jsonb array)
//   worker_disputes  (count opened + resolved in period)
//   worker_record_exports (count + format breakdown)
//
// Verifies:
//   For each company, fetch the period's shift_events in chain order,
//   plus the immediately-preceding event (chain anchor for the period).
//   Run the WLES v1.0 verifier from scripts/wles-v1-verify.mjs against
//   that segment. Any failure → reported in "Chain integrity issues".
//
// Writes:
//   FLOSMOSIS/operations/integrity-reports/YYYY-MM.md
//
// Usage:
//   node scripts/integrity-report-monthly.mjs                  # previous month
//   node scripts/integrity-report-monthly.mjs --period 2026-04
//   node scripts/integrity-report-monthly.mjs --period 2026-04 --dry-run
//
// Env required:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY  (server-side only; never bundle)
//
// Optional env:
//   FLOSMOSIS_OPERATIONS_DIR   (default: ../FLOSMOSIS/operations)
// ---------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── arg parsing ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const next = args[i + 1];
  return next && !next.startsWith('--') ? next : true;
}

const dryRun = flag('--dry-run') === true;
const periodArg = flag('--period');

function defaultPreviousMonth() {
  const now = new Date();
  // First day of THIS month UTC, then back one millisecond → last
  // day of previous month. Format YYYY-MM.
  const firstOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lastOfPrev = new Date(firstOfThisMonth.getTime() - 1);
  const y = lastOfPrev.getUTCFullYear();
  const m = String(lastOfPrev.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

const period = typeof periodArg === 'string' ? periodArg : defaultPreviousMonth();
if (!/^\d{4}-\d{2}$/.test(period)) {
  console.error(`✗ invalid --period "${period}", expected YYYY-MM`);
  process.exit(1);
}

const [yearStr, monthStr] = period.split('-');
const year = Number(yearStr);
const month = Number(monthStr);
const periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
const periodEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0) - 1); // 23:59:59.999 of last day

console.log(`▶ integrity-report-monthly for ${period}`);
console.log(`  window: ${periodStart.toISOString()} → ${periodEnd.toISOString()}`);
console.log(`  dry-run: ${dryRun}`);

// ─── env ─────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

const operationsDir =
  process.env.FLOSMOSIS_OPERATIONS_DIR ??
  path.resolve(__dirname, '../../FLOSMOSIS/operations');
const outDir = path.join(operationsDir, 'integrity-reports');
const outFile = path.join(outDir, `${period}.md`);

// ─── client ──────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ─── helpers ─────────────────────────────────────────────────────────
async function fetchAll(table, select, eqs = [], gtes = [], ltes = []) {
  // Pagination loop — Supabase caps PostgREST page sizes.
  const pageSize = 1000;
  let offset = 0;
  const out = [];
  for (;;) {
    let q = supabase.from(table).select(select).order('created_at', { ascending: true });
    for (const [c, v] of eqs) q = q.eq(c, v);
    for (const [c, v] of gtes) q = q.gte(c, v);
    for (const [c, v] of ltes) q = q.lte(c, v);
    q = q.range(offset, offset + pageSize - 1);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

function canonicalize(v) {
  if (Array.isArray(v)) return '[' + v.map(canonicalize).join(',') + ']';
  if (v && typeof v === 'object') {
    const keys = Object.keys(v).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

function sha256Hex(s) {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

// ─── period queries ──────────────────────────────────────────────────
console.log('▶ fetching shift_events for period…');
const events = await fetchAll(
  'shift_events',
  'id, company_id, worker_id, site_id, event_type, event_data, event_hash, previous_event_hash, created_at, spec_version, wles_event',
  [],
  [['created_at', periodStart.toISOString()]],
  [['created_at', periodEnd.toISOString()]],
);
console.log(`  ${events.length} events`);

const eventTypeCounts = {};
for (const e of events) {
  eventTypeCounts[e.event_type] = (eventTypeCounts[e.event_type] ?? 0) + 1;
}

// Companies that had activity in period
const companyIds = [...new Set(events.map((e) => e.company_id))];
console.log(`  ${companyIds.length} companies active in period`);

// ─── verifier pass on the period segment ─────────────────────────────
// For each company: fetch this period's events + the immediate prior
// event (chain anchor). Walk in order: each event's stored event_hash
// must equal sha256(canonical(event_data)) and previous_event_hash
// must equal the prior event's event_hash.
console.log('▶ verifier pass…');
const verifierFailures = [];
let eventsVerified = 0;

for (const cid of companyIds) {
  // Anchor: the latest event BEFORE periodStart
  const { data: anchorRows, error: anchorErr } = await supabase
    .from('shift_events')
    .select('id, event_hash, created_at')
    .eq('company_id', cid)
    .lt('created_at', periodStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(1);
  if (anchorErr) throw new Error(`anchor[${cid}]: ${anchorErr.message}`);
  const anchorHash = anchorRows && anchorRows.length > 0 ? anchorRows[0].event_hash : null;

  // Period rows for this company, in chain order
  const periodRows = events
    .filter((e) => e.company_id === cid)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));

  let prevHash = anchorHash;
  for (const row of periodRows) {
    eventsVerified++;
    // Self-hash check
    let selfOk = true;
    let expectedSelf = null;
    if (row.spec_version === '1.0' && row.wles_event) {
      // v1.0 events: hash field embedded in wles_event must equal
      // sha256(canonical(wles_event without the hash field)).
      const we = row.wles_event;
      const { hash: storedHash, ...rest } = we;
      expectedSelf = sha256Hex(canonicalize(rest));
      selfOk = storedHash === expectedSelf;
    } else {
      expectedSelf = sha256Hex(canonicalize(row.event_data));
      selfOk = row.event_hash === expectedSelf;
    }
    if (!selfOk) {
      verifierFailures.push({
        company_id: cid,
        event_id: row.id,
        event_type: row.event_type,
        reason: 'SELF_HASH_MISMATCH',
        expected: expectedSelf,
        actual: row.event_hash,
        created_at: row.created_at,
      });
    }
    // Chain-link check (only meaningful for v0 / legacy events; v1.0
    // chains its own previous-hash inside wles_event).
    if (!(row.spec_version === '1.0' && row.wles_event)) {
      if (prevHash !== null && row.previous_event_hash !== prevHash) {
        verifierFailures.push({
          company_id: cid,
          event_id: row.id,
          event_type: row.event_type,
          reason: 'CHAIN_LINK_MISMATCH',
          expected: prevHash,
          actual: row.previous_event_hash,
          created_at: row.created_at,
        });
      }
    }
    prevHash = row.event_hash;
  }
}
console.log(`  verified ${eventsVerified} events; ${verifierFailures.length} failures`);

// ─── anomaly flags ───────────────────────────────────────────────────
console.log('▶ fetching anomaly_flags from shifts…');
const shifts = await fetchAll(
  'shifts',
  'id, company_id, anomaly_flags, created_at',
  [],
  [['created_at', periodStart.toISOString()]],
  [['created_at', periodEnd.toISOString()]],
);

const anomalyBuckets = { HIGH: 0, MEDIUM: 0, LOW: 0 };
const ruleBreakdown = {}; // ruleName → { HIGH, MEDIUM, LOW }
for (const s of shifts) {
  const flags = Array.isArray(s.anomaly_flags) ? s.anomaly_flags : [];
  for (const f of flags) {
    const sev = (f && f.severity ? String(f.severity).toUpperCase() : 'LOW');
    if (anomalyBuckets[sev] !== undefined) anomalyBuckets[sev]++;
    const rule = f && f.rule ? String(f.rule) : 'unknown';
    ruleBreakdown[rule] ??= { HIGH: 0, MEDIUM: 0, LOW: 0 };
    if (ruleBreakdown[rule][sev] !== undefined) ruleBreakdown[rule][sev]++;
  }
}

// ─── worker actions ──────────────────────────────────────────────────
console.log('▶ fetching worker_disputes + worker_record_exports…');
let disputes = [];
let exports_ = [];
try {
  disputes = await fetchAll(
    'worker_disputes',
    'id, status, opened_at, resolved_at',
    [],
    [['opened_at', periodStart.toISOString()]],
    [['opened_at', periodEnd.toISOString()]],
  );
} catch (e) {
  console.warn(`  worker_disputes table not yet available: ${e.message}`);
}
try {
  exports_ = await fetchAll(
    'worker_record_exports',
    'id, format, exported_at',
    [],
    [['exported_at', periodStart.toISOString()]],
    [['exported_at', periodEnd.toISOString()]],
  );
} catch (e) {
  console.warn(`  worker_record_exports table not yet available: ${e.message}`);
}

const disputesOpened = disputes.length;
const disputesResolved = disputes.filter((d) => d.status === 'RESOLVED').length;
const exportFormatBreakdown = exports_.reduce((acc, x) => {
  acc[x.format] = (acc[x.format] ?? 0) + 1;
  return acc;
}, {});

// ─── render markdown ─────────────────────────────────────────────────
function row(label, value) {
  return `| ${label} | ${value} |`;
}

const verifierPass = verifierFailures.length === 0;
const verifierLine = verifierPass
  ? `${eventsVerified}/${eventsVerified} (100%)`
  : `${eventsVerified - verifierFailures.length}/${eventsVerified} (${
      eventsVerified === 0 ? 0 : (((eventsVerified - verifierFailures.length) / eventsVerified) * 100).toFixed(2)
    }%)`;

const md = `# Chain integrity report — ${period}
# Auto-generated ${new Date().toISOString()} by integrity-report-monthly.mjs
# Period covered: ${periodStart.toISOString()} → ${periodEnd.toISOString()}

## Summary

${row('Total events sealed', events.length)}
${row('Verifier-pass rate', verifierLine)}
${row('Anomaly count (HIGH / MEDIUM / LOW)', `${anomalyBuckets.HIGH} / ${anomalyBuckets.MEDIUM} / ${anomalyBuckets.LOW}`)}
${row('Chain integrity issues', verifierFailures.length)}
${row('Worker-record exports', exports_.length)}
${row('Worker disputes opened', disputesOpened)}
${row('Worker disputes resolved', disputesResolved)}
${row('Companies active in period', companyIds.length)}

## Events by type

| Event type | Count |
|---|---|
${Object.entries(eventTypeCounts)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([k, v]) => `| \`${k}\` | ${v} |`)
  .join('\n')}

## Verifier results

- Events processed: ${eventsVerified}
- Events passed: ${eventsVerified - verifierFailures.length}
- Events failed: ${verifierFailures.length}
- Companies in chain segment: ${companyIds.length}

${verifierPass
  ? '_All events in the period passed self-hash + chain-link verification. No further action required._'
  : '_❗ Verifier failures detected. This is a P0 incident and requires immediate founder + Cowork investigation._'}

## Anomaly breakdown (INTELLIGENCE flag rules)

${Object.keys(ruleBreakdown).length === 0
  ? '_No anomaly flags raised in this period._'
  : `| Rule | HIGH | MEDIUM | LOW |
|---|---|---|---|
${Object.entries(ruleBreakdown)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([rule, b]) => `| ${rule} | ${b.HIGH} | ${b.MEDIUM} | ${b.LOW} |`)
    .join('\n')}`}

## Worker actions

- **Disputes opened:** ${disputesOpened}.
- **Disputes resolved in period:** ${disputesResolved}.
- **Records exports performed:** ${exports_.length}${
  Object.keys(exportFormatBreakdown).length > 0
    ? ` (formats: ${Object.entries(exportFormatBreakdown)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ')}).`
    : '.'
}

## Chain integrity issues (detail)

${verifierFailures.length === 0
  ? '_None observed in this period._'
  : verifierFailures
      .slice(0, 50)
      .map(
        (f) =>
          `- **${f.event_id}** · company \`${f.company_id}\` · type \`${f.event_type}\` · reason \`${f.reason}\` · created_at \`${f.created_at}\`\n  - expected \`${f.expected}\`\n  - actual \`${f.actual}\``,
      )
      .join('\n')}

## Notes

_[Founder annotates here on review.]_

---

**Reviewed by Lauren on YYYY-MM-DD.** _[Founder signs off here.]_
`;

// ─── write file ──────────────────────────────────────────────────────
if (dryRun) {
  console.log('\n--- DRY RUN — would write to ' + outFile + ' ---\n');
  console.log(md);
  process.exit(0);
}

if (!existsSync(outDir)) {
  await mkdir(outDir, { recursive: true });
}
await writeFile(outFile, md, 'utf8');
console.log(`✓ wrote ${outFile}`);

// Exit non-zero if verifier failures, so the cron route can route the
// call through to the alert/email pipeline.
process.exit(verifierPass ? 0 : 2);
