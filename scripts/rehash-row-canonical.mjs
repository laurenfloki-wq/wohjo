#!/usr/bin/env node
// ---------------------------------------------------------------------
// rehash-row-canonical.mjs
//
// One-off operations script. Reads a single shift_events row from prod
// (or staging), recomputes its event_hash using the canonical-stringify
// generateEventHash from src/lib/wles/hash.ts, and prints the SQL
// UPDATE statement Lauren applies via Supabase SQL Editor.
//
// CONTEXT: Friday 2026-05-01 substrate-DD finding. PostgreSQL JSONB
// does NOT preserve key insertion order. The pre-canonical
// JSON.stringify implementation produced different bytes for the same
// logical event_data depending on key order. The original event_hash
// stored at write time used insertion-order serialisation; on read,
// PG returns the keys in alphabetical order, and a hash recompute
// with JSON.stringify produced different bytes → SELF_HASH_MISMATCH at
// verification.
//
// The canonicalStringify + generateEventHash fix at <commit-hash>
// makes recompute stable. Existing rows written under the old
// implementation need their event_hash updated to the canonical hash
// once.
//
// Usage:
//   node scripts/rehash-row-canonical.mjs <shift_event_id>
//
// Required env:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY  (server-side only; never bundle)
//
// What it does:
//   1. Reads the row by id (NO write).
//   2. Computes the canonical event_hash from the row's actual content.
//   3. Reports the OLD hash (currently stored) and the NEW canonical
//      hash, plus a ready-to-apply SQL UPDATE template with a triple
//      WHERE clause guard (id + worker_id + current event_hash).
//   4. Lauren copy-pastes the SQL into Supabase SQL Editor to apply.
//
// Safety:
//   - This script does NOT write to the database.
//   - The output SQL UPDATE has a triple WHERE guard so a copy-paste
//     against the wrong row is a no-op (zero rows updated) rather than
//     corruption.
//   - Run --dry-run to print the SQL but skip the read entirely
//     (validates the script wiring without touching prod).
// ---------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

// ─── Canonical JSON serialisation (mirrors src/lib/wles/hash.ts) ────
// Sorts object keys alphabetically, recursively. Same logical data
// produces same bytes regardless of insertion order or PG-side
// canonicalisation.
function canonicalStringify(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + canonicalStringify(obj[k]))
      .join(',') +
    '}'
  );
}

function generateEventHash(event) {
  const input = [
    event.company_id,
    event.worker_id,
    event.site_id,
    event.event_type,
    canonicalStringify(event.event_data),
    new Date(event.created_at).toISOString(),
  ].join('|');
  return createHash('sha256').update(input).digest('hex');
}

// ─── CLI ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const shiftEventId = args.find((a) => !a.startsWith('--'));

if (!shiftEventId) {
  console.error('Usage: node scripts/rehash-row-canonical.mjs <shift_event_id>');
  console.error('       node scripts/rehash-row-canonical.mjs <shift_event_id> --dry-run');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: row, error } = await supabase
  .from('shift_events')
  .select(
    'id, company_id, worker_id, site_id, event_type, event_data, event_hash, previous_event_hash, created_at',
  )
  .eq('id', shiftEventId)
  .single();

if (error || !row) {
  console.error(`Could not read shift_events row id=${shiftEventId}:`, error?.message ?? 'not found');
  process.exit(1);
}

const oldHash = row.event_hash;
const newHash = generateEventHash(row);

console.log('───────────────────────────────────────────────────────────────');
console.log(' Row id:           ', row.id);
console.log(' worker_id:        ', row.worker_id);
console.log(' site_id:          ', row.site_id);
console.log(' event_type:       ', row.event_type);
console.log(' created_at:       ', row.created_at);
console.log(' event_data:       ', JSON.stringify(row.event_data));
console.log(' previous_event_hash:', row.previous_event_hash);
console.log('───────────────────────────────────────────────────────────────');
console.log(' OLD event_hash:   ', oldHash);
console.log(' NEW canonical hash:', newHash);
console.log('───────────────────────────────────────────────────────────────');

if (oldHash === newHash) {
  console.log('');
  console.log(' ✓ Row already has the canonical hash. No update needed.');
  console.log('');
  process.exit(0);
}

console.log('');
console.log(' SQL to apply via Supabase SQL Editor (triple-guarded):');
console.log('');
console.log('───────────────────────────────────────────────────────────────');
console.log(`UPDATE public.shift_events`);
console.log(`  SET event_hash = '${newHash}'`);
console.log(`  WHERE id = '${row.id}'`);
console.log(`    AND worker_id = '${row.worker_id}'`);
console.log(`    AND event_hash = '${oldHash}';`);
console.log('───────────────────────────────────────────────────────────────');
console.log('');
console.log(' Expected effect: 1 row updated.');
console.log(' If WHERE matches no rows (returned 0): the row was already');
console.log(' rehashed by another path, or one of {id, worker_id, event_hash}');
console.log(' has changed — investigate before retrying.');
console.log('');
