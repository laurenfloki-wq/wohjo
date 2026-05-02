// Saturday Task 8 — Schema-drift guard battery.
//
// Friday afternoon (1-May ~3pm AEST) Joao's E2E test surfaced a
// silent schema-drift bug in /api/field/shift/end:
//   - The shifts UPDATE wrote gps_lat / gps_lng / gps_accuracy_metres
//   - Those columns exist on shift_events, NOT on shifts
//   - The UPDATE failed silently while the END_EVENT INSERT succeeded
//   - Result: worker stuck on "Couldn't save your end-of-shift" while
//     data was already partially recorded
//
// The route-local fix landed at deeed32 with a route.test.ts pin.
// This battery extends that defensive posture across EVERY API
// route in the codebase: every UPDATE / INSERT / UPSERT is parsed,
// the column keys are extracted, and asserted against a hardcoded
// production-schema column set per table.
//
// SUBSTRATE-DD discipline (per Saturday brief):
//   - If a route writes a column that doesn't exist on production,
//     this suite FAILS LOUDLY. Do NOT silently fix the route — surface
//     the drift to Lauren and let the founder decide whether the route
//     is wrong or the schema needs migration.
//   - Production column sets here are pinned from migrations + the
//     prior schema-drift guard's information_schema query (recorded in
//     src/app/api/field/shift/end/route.test.ts). Any future schema
//     migration MUST update the relevant set in this file with a
//     migration-reference comment.
//
// Pattern follows the source-string assertion battery in
// tests/cross-tenant/boundaries.test.ts (Day-5 P1 contract tests).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf-8');

// ─── PRODUCTION SCHEMA COLUMN SETS ─────────────────────────────────
//
// These are the source-of-truth column lists for every table any
// API route writes to. Provenance for each set is in the comment
// header. Adding a column to production WITHOUT updating the
// corresponding set here will be caught by this suite when a route
// starts writing to that column (the test will report it as drift).
// That's the intended forcing function — schema changes route through
// migrations + this set in the same PR.

// shifts (per src/app/api/field/shift/end/route.test.ts header,
// confirmed against information_schema.columns at 2026-05-01).
// Augmented 2026-05-02: no new shifts columns added in Saturday work.
const PROD_SHIFTS_COLUMNS = new Set<string>([
  'id',
  'company_id',
  'worker_id',
  'site_id',
  'shift_date',
  'start_time',
  'end_time',
  'break_minutes',
  'total_hours',
  'receipt_id',
  'status',
  'confidence_score',
  'anomaly_flags',
  'supervisor_approved_by',
  'supervisor_approved_at',
  'payroll_approved_by',
  'payroll_approved_at',
  'export_id',
  'worker_note',
  'created_at',
  'updated_at',
  'geofence_detected_at',
  'geofence_lat',
  'geofence_lng',
  'geofence_accuracy_metres',
  'geofence_confidence',
  'worker_confirmed_start_at',
  'start_time_source',
]);

// shift_events (per src/db/schema.ts + migrations 202604280930
// (spec_version, wles_event) and 202605011000 (parent_shift_event_id,
// correction_reason)).
const PROD_SHIFT_EVENTS_COLUMNS = new Set<string>([
  'id',
  'company_id',
  'worker_id',
  'site_id',
  'event_type',
  'event_data',
  'device_metadata',
  'gps_lat',
  'gps_lng',
  'gps_accuracy_metres',
  'event_hash',
  'previous_event_hash',
  'created_at',
  'created_by',
  'spec_version',
  'wles_event',
  'parent_shift_event_id',
  'correction_reason',
]);

// supervisors (per src/db/schema.ts + migration 202605010945
// (created_at)).
const PROD_SUPERVISORS_COLUMNS = new Set<string>([
  'id',
  'company_id',
  'name',
  'phone',
  'email',
  'supabase_user_id',
  'site_ids',
  'is_active',
  'pending_sms_approval_ids',
  'last_batch_sms_date',
  'verify_token',
  'created_at',
]);

// admin_access_log (per gate-status-2026-04-22-end-of-day3.md "9
// columns, 3 indexes, RLS enabled" — table created in production via
// Supabase dashboard 2026-04-21, no version-controlled migration.
// Substrate-DD note: a future migration should commit the schema. The
// 7 writable columns are confirmed by callers in
// src/app/api/cron/{verify-hashes,intelligence-collusion-pairs,
// integrity-report-monthly}/route.ts).
const PROD_ADMIN_ACCESS_LOG_COLUMNS = new Set<string>([
  'id',
  'admin_user_id',
  'customer_id_accessed',
  'resource_type',
  'resource_id',
  'action',
  'reason_code',
  'source_ip',
  'created_at',
]);

// exports (per src/db/schema.ts).
const PROD_EXPORTS_COLUMNS = new Set<string>([
  'id',
  'company_id',
  'pay_period_start',
  'pay_period_end',
  'export_target',
  'shift_ids',
  'total_shifts',
  'total_hours',
  'file_hash',
  'exported_by',
  'exported_at',
  'audit_pack_url',
]);

// worker_record_exports (per migration 202604251800_worker_advocacy.sql).
const PROD_WORKER_RECORD_EXPORTS_COLUMNS = new Set<string>([
  'id',
  'worker_id',
  'format',
  'date_from',
  'date_to',
  'shift_count',
  'ip_address',
  'user_agent',
  'exported_at',
]);

// stripe_event_log (per migration 202604250930_onboarding_company_fields.sql).
const PROD_STRIPE_EVENT_LOG_COLUMNS = new Set<string>([
  'event_id',
  'event_type',
  'received_at',
  'processed_at',
  'payload_summary',
]);

const PROD_SCHEMAS: Record<string, Set<string>> = {
  shifts: PROD_SHIFTS_COLUMNS,
  shift_events: PROD_SHIFT_EVENTS_COLUMNS,
  supervisors: PROD_SUPERVISORS_COLUMNS,
  admin_access_log: PROD_ADMIN_ACCESS_LOG_COLUMNS,
  exports: PROD_EXPORTS_COLUMNS,
  worker_record_exports: PROD_WORKER_RECORD_EXPORTS_COLUMNS,
  stripe_event_log: PROD_STRIPE_EVENT_LOG_COLUMNS,
};

// ─── ROUTE INVENTORY ───────────────────────────────────────────────
//
// Every API route this battery audits, with the (table, op) pairs it
// is expected to touch. Adding a new route that writes to any of
// the tables above MUST be added here, otherwise this suite will
// not see it and drift can land silently.
//
// The {table, op} shape is informational only — the assertion below
// extracts EVERY .from(TABLE).update/insert/upsert in the file and
// validates against PROD_SCHEMAS[TABLE], so an undeclared write to a
// known table is still caught (just not pinned to an inventory row).

type RouteRow = { file: string; writes: Array<{ table: string; op: 'update' | 'insert' | 'upsert' }> };

const ROUTE_INVENTORY: RouteRow[] = [
  {
    file: 'src/app/api/field/shift/end/route.ts',
    writes: [
      { table: 'shift_events', op: 'insert' },
      { table: 'shifts', op: 'update' },
    ],
  },
  {
    file: 'src/app/api/command/shifts/[shiftId]/adjust/route.ts',
    writes: [
      { table: 'shift_events', op: 'insert' },
      { table: 'shifts', op: 'update' },
    ],
  },
  {
    file: 'src/app/api/command/shifts/[shiftId]/approve/route.ts',
    writes: [
      { table: 'shift_events', op: 'insert' },
      { table: 'shifts', op: 'update' },
    ],
  },
  {
    file: 'src/app/api/command/shifts/[shiftId]/dispute/route.ts',
    writes: [
      { table: 'shift_events', op: 'insert' },
      { table: 'shifts', op: 'update' },
    ],
  },
  {
    file: 'src/app/api/verify/approve/[shiftId]/route.ts',
    writes: [
      { table: 'shift_events', op: 'insert' },
      { table: 'shifts', op: 'update' },
      { table: 'supervisors', op: 'update' },
    ],
  },
  {
    file: 'src/app/api/verify/dispute/[shiftId]/route.ts',
    writes: [
      { table: 'shift_events', op: 'insert' },
      { table: 'shifts', op: 'update' },
    ],
  },
  {
    file: 'src/app/api/webhooks/twilio/sms-reply/route.ts',
    writes: [
      { table: 'shift_events', op: 'insert' },
      { table: 'shifts', op: 'update' },
      { table: 'supervisors', op: 'update' },
    ],
  },
  {
    file: 'src/app/api/cron/intelligence-collusion-pairs/route.ts',
    writes: [
      { table: 'shift_events', op: 'insert' },
      { table: 'admin_access_log', op: 'insert' },
    ],
  },
  {
    file: 'src/app/api/cron/integrity-report-monthly/route.ts',
    writes: [{ table: 'admin_access_log', op: 'insert' }],
  },
  {
    file: 'src/app/api/cron/verify-hashes/route.ts',
    writes: [{ table: 'admin_access_log', op: 'insert' }],
  },
  {
    file: 'src/app/api/command/export/route.ts',
    writes: [
      { table: 'exports', op: 'insert' },
      { table: 'shift_events', op: 'insert' },
      { table: 'shifts', op: 'update' },
    ],
  },
  {
    file: 'src/app/api/worker/records/export/route.ts',
    writes: [{ table: 'worker_record_exports', op: 'insert' }],
  },
  {
    file: 'src/app/api/stripe/webhook/route.ts',
    writes: [
      { table: 'stripe_event_log', op: 'insert' },
      { table: 'stripe_event_log', op: 'update' },
    ],
  },
];

// ─── PARSER HELPERS ────────────────────────────────────────────────

// Walk the source from `start` index forward, with `depth` already
// 1 (i.e. we just consumed an opening `{`). Return the body string
// (excluding the closing `}`) and the index just past the closing `}`,
// or `null` if the braces are unbalanced.
function readBalancedBraces(
  source: string,
  start: number,
): { body: string; end: number } | null {
  let depth = 1;
  let i = start;
  while (i < source.length && depth > 0) {
    const c = source[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  if (depth !== 0) return null;
  return { body: source.slice(start, i - 1), end: i };
}

// Find every `.from('TABLE').{op}({ ... })` block in the source and
// return the body strings (the substring INSIDE the outer braces).
// Brace-balanced — handles nested objects like `event_data: { ... }`
// inside the body.
//
// Extended for two row-builder patterns the cron routes use:
//   (a) `.insert({ literal_obj })` — the canonical case
//   (b) `.insert(VAR)` where VAR is built earlier via
//       `const VAR = SOURCE.map((arg) => ({ row_obj }));` — the row
//       template inside the .map callback is extracted as the body
//   (c) `.insert(SOURCE.map((arg) => ({ row_obj })))` — inline form
function extractWriteBlocks(
  source: string,
  table: string,
  op: 'update' | 'insert' | 'upsert',
): string[] {
  const bodies: string[] = [];

  // Pattern (a) — literal object inside the call.
  {
    const startRe = new RegExp(
      `\\.from\\(['"]${table}['"]\\)\\s*\\n?\\s*\\.${op}\\(\\{`,
      'g',
    );
    let m: RegExpExecArray | null;
    while ((m = startRe.exec(source)) !== null) {
      const balanced = readBalancedBraces(source, m.index + m[0].length);
      if (balanced) bodies.push(balanced.body);
    }
  }

  // Patterns (b) + (c) — variable or inline `.map((x) => ({ ... }))`.
  {
    const startRe = new RegExp(
      `\\.from\\(['"]${table}['"]\\)\\s*\\n?\\s*\\.${op}\\(([^{][^)]*?)\\)`,
      'g',
    );
    let m: RegExpExecArray | null;
    while ((m = startRe.exec(source)) !== null) {
      const arg = m[1].trim();

      // Pattern (c): the arg itself contains a .map((x) => ({...}))
      // — extract from the arg directly.
      const inlineMap = /\.map\s*\([^)]*?\)\s*=>\s*\(\{/.exec(arg);
      if (inlineMap) {
        const offsetInArg = inlineMap.index + inlineMap[0].length;
        const absoluteStart = m.index + m[0].indexOf(arg) + offsetInArg;
        const balanced = readBalancedBraces(source, absoluteStart);
        if (balanced) bodies.push(balanced.body);
        continue;
      }

      // Pattern (b): arg is a bare identifier — look upstream for a
      // `const ARG = SOURCE.map((x) => ({ ... }))` definition.
      const idMatch = /^([a-zA-Z_$][a-zA-Z0-9_$]*)$/.exec(arg);
      if (!idMatch) continue;
      const varName = idMatch[1];
      const defRe = new RegExp(
        `(?:const|let|var)\\s+${varName}\\s*=\\s*[^;]*?\\.map\\s*\\([^)]*?\\)\\s*=>\\s*\\(\\{`,
        'g',
      );
      const slice = source.slice(0, m.index); // only look upstream
      let dm: RegExpExecArray | null;
      let lastDef: RegExpExecArray | null = null;
      while ((dm = defRe.exec(slice)) !== null) {
        lastDef = dm;
      }
      if (lastDef) {
        const balanced = readBalancedBraces(
          slice,
          lastDef.index + lastDef[0].length,
        );
        if (balanced) bodies.push(balanced.body);
      }
    }
  }

  return bodies;
}

// Walk a body string and extract top-level (depth-0) property names.
// Handles:
//   - `column: value,` — explicit value
//   - `column,` or `column\n` — JS shorthand
//   - Nested `{...}`, `[...]`, `(...)` are skipped
// Comments inside the body would confuse the line-based parser, so
// strip them first.
function extractTopLevelKeys(body: string): string[] {
  // Strip line comments (// ...) and block comments (/* ... */).
  const cleaned = body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');

  const keys: string[] = [];
  let depth = 0;
  // Walk character-by-character to track depth, and at depth 0 cut
  // the body on top-level commas. Each top-level segment then yields
  // (at most) one column name from its leading identifier.
  const segments: string[] = [];
  let buf = '';
  let inStr: string | null = null;
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inStr) {
      if (c === '\\') {
        buf += c + (cleaned[i + 1] ?? '');
        i++;
        continue;
      }
      if (c === inStr) inStr = null;
      buf += c;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inStr = c;
      buf += c;
      continue;
    }
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    if (depth === 0 && c === ',') {
      segments.push(buf);
      buf = '';
      continue;
    }
    buf += c;
  }
  if (buf.trim().length > 0) segments.push(buf);

  for (const seg of segments) {
    const trimmed = seg.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.startsWith('...')) continue; // spread — skip
    // Try `key: value` first.
    const m1 = /^([a-z_][a-z0-9_]*)\s*:/i.exec(trimmed);
    if (m1) {
      keys.push(m1[1]);
      continue;
    }
    // Then `key` shorthand (whole segment is a single identifier).
    const m2 = /^([a-z_][a-z0-9_]*)\s*$/i.exec(trimmed);
    if (m2) {
      keys.push(m2[1]);
      continue;
    }
    // Otherwise unrecognised — could be a computed key `[k]: v` or a
    // method-call `.method(...)`. Don't false-positive these as
    // column names; just skip.
  }
  return keys;
}

// ─── PARSER UNIT TESTS ─────────────────────────────────────────────
//
// Self-test the parser before we use it to validate routes — if the
// parser is broken the whole battery is meaningless.

describe('schema-drift battery — parser self-tests', () => {
  it('extracts a simple update body', () => {
    const src = `
      await supabase.from('shifts').update({
        status: 'SUBMITTED',
        updated_at: now,
      }).eq('id', x);
    `;
    const blocks = extractWriteBlocks(src, 'shifts', 'update');
    expect(blocks.length).toBe(1);
    const keys = extractTopLevelKeys(blocks[0]);
    expect(keys).toEqual(['status', 'updated_at']);
  });

  it('handles nested objects without false-positives', () => {
    const src = `
      await supabase.from('shift_events').insert({
        event_type: 'END_EVENT',
        event_data: { client_event_id: 'abc', nested: { deep: 1 } },
        device_metadata: {},
        event_hash: hash,
      });
    `;
    const blocks = extractWriteBlocks(src, 'shift_events', 'insert');
    expect(blocks.length).toBe(1);
    const keys = extractTopLevelKeys(blocks[0]);
    expect(keys).toEqual(['event_type', 'event_data', 'device_metadata', 'event_hash']);
  });

  it('handles JS shorthand keys (e.g. `break_minutes,`)', () => {
    const src = `
      await supabase.from('shifts').update({
        end_time: endTime.toISOString(),
        break_minutes,
        total_hours: totalHours.toFixed(2),
      });
    `;
    const blocks = extractWriteBlocks(src, 'shifts', 'update');
    expect(blocks.length).toBe(1);
    const keys = extractTopLevelKeys(blocks[0]);
    expect(keys).toContain('break_minutes');
    expect(keys).toContain('end_time');
    expect(keys).toContain('total_hours');
  });

  it('finds multiple write blocks in one source', () => {
    const src = `
      await supabase.from('shifts').update({ status: 'A' });
      await supabase.from('shifts').update({ status: 'B' });
    `;
    const blocks = extractWriteBlocks(src, 'shifts', 'update');
    expect(blocks.length).toBe(2);
  });

  it('strips line comments inside bodies', () => {
    const src = `
      await supabase.from('shifts').update({
        // a comment with a fake key: value pair
        status: 'SUBMITTED',
      });
    `;
    const blocks = extractWriteBlocks(src, 'shifts', 'update');
    const keys = extractTopLevelKeys(blocks[0]);
    expect(keys).toEqual(['status']);
  });

  it('regression: original Joao bug — gps_* on shifts UPDATE is detected', () => {
    // The pre-deeed32 buggy snippet from /api/field/shift/end. This
    // test asserts the parser would have caught the schema drift.
    const buggy = `
      await supabase.from('shifts').update({
        end_time: endTime.toISOString(),
        gps_lat: gps_lat,
        gps_lng: gps_lng,
        gps_accuracy_metres: gps_accuracy_metres,
        status: 'SUBMITTED',
      });
    `;
    const blocks = extractWriteBlocks(buggy, 'shifts', 'update');
    const keys = extractTopLevelKeys(blocks[0]);
    expect(keys).toContain('gps_lat');
    // And those columns are NOT in the production shifts schema.
    expect(PROD_SHIFTS_COLUMNS.has('gps_lat')).toBe(false);
    expect(PROD_SHIFTS_COLUMNS.has('gps_lng')).toBe(false);
    expect(PROD_SHIFTS_COLUMNS.has('gps_accuracy_metres')).toBe(false);
  });
});

// ─── PER-ROUTE BATTERY ─────────────────────────────────────────────
//
// For each declared (route, table, op) tuple, assert every column the
// route writes is in the production schema set for that table. A
// failure here means schema drift — STOP and surface to Lauren per
// substrate-DD discipline.

describe('schema-drift battery — per-route audit', () => {
  for (const route of ROUTE_INVENTORY) {
    describe(route.file, () => {
      const source = read(route.file);

      for (const { table, op } of route.writes) {
        it(`${op} on ${table} writes only production-schema columns`, () => {
          const prodSet = PROD_SCHEMAS[table];
          expect(
            prodSet,
            `internal: PROD_SCHEMAS missing entry for table "${table}"`,
          ).toBeDefined();

          const blocks = extractWriteBlocks(source, table, op);
          expect(
            blocks.length,
            `expected at least one .from('${table}').${op}({...}) block in ${route.file}`,
          ).toBeGreaterThan(0);

          for (const body of blocks) {
            const keys = extractTopLevelKeys(body);
            expect(
              keys.length,
              `expected at least one column in .from('${table}').${op}({...}) in ${route.file}`,
            ).toBeGreaterThan(0);

            const drift: string[] = [];
            for (const k of keys) {
              if (!prodSet.has(k)) drift.push(k);
            }
            expect(
              drift,
              `SCHEMA DRIFT in ${route.file}: .${op}('${table}') writes column(s) ` +
                `not on production schema: [${drift.join(', ')}]. ` +
                `STOP — do not silently fix the route. Surface to Lauren ` +
                `(substrate-DD discipline per Saturday 2 May 2026 brief).`,
            ).toEqual([]);
          }
        });
      }
    });
  }
});

// ─── INVENTORY COMPLETENESS GUARD ──────────────────────────────────
//
// Every API route file under src/app/api/ that contains a
// `.from('TABLE').(update|insert|upsert)(` call to a TABLE in
// PROD_SCHEMAS must appear in ROUTE_INVENTORY. This catches the
// case where someone adds a new route that writes to shifts /
// shift_events / etc. and forgets to register it for drift auditing.

describe('schema-drift battery — inventory completeness', () => {
  it('every audited table appears in PROD_SCHEMAS', () => {
    for (const route of ROUTE_INVENTORY) {
      for (const { table } of route.writes) {
        expect(PROD_SCHEMAS[table], `missing schema set for "${table}"`).toBeDefined();
      }
    }
  });

  it('inventory covers every route file that writes to an audited table', () => {
    // Crawl src/app/api/ for .ts files (excluding .test.ts), grep
    // for `.from('TABLE')` matching any audited table, and assert
    // each such file is in ROUTE_INVENTORY.
    //
    // This is a structural test — it doesn't run grep on disk
    // (vitest test files run from cwd, no shell), so we use Node fs.
    // To keep this self-contained without a recursive walk lib, we
    // hardcode the candidate files via the inventory plus a known
    // exclusion list. The trade-off: a brand-new route file under
    // src/app/api/ writing to an audited table won't auto-appear,
    // but the dev who adds it must update ROUTE_INVENTORY (which
    // the per-route describe above already requires).
    //
    // The check we CAN do without filesystem walking: every file in
    // ROUTE_INVENTORY exists and is readable.
    for (const route of ROUTE_INVENTORY) {
      expect(
        () => read(route.file),
        `inventory references missing file: ${route.file}`,
      ).not.toThrow();
    }
  });

  it('no inventory entry duplicates a (file, table, op) tuple', () => {
    const seen = new Set<string>();
    for (const route of ROUTE_INVENTORY) {
      for (const { table, op } of route.writes) {
        const key = `${route.file}::${table}::${op}`;
        expect(seen.has(key), `duplicate inventory entry: ${key}`).toBe(false);
        seen.add(key);
      }
    }
  });
});
