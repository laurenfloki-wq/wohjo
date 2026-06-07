// Final attestation — five fingerprints in three categories.
// Reads the already-generated rebuild output files and computes:
//
//   1. column_fp (engine string_agg ORDER BY)
//      Target: e9aa2888cf558480ef7266f3517becf7
//   2. constraint_fp (C-locale sort, bytewise)
//      Target: 5568b4be09f8e8cef2851f8ed4ce9bef
//   3. collation-immune fingerprints (md5-of-md5s, order-independent):
//      columns:     e2f03afb5e7ebd0a6b6aca2a5d744d11
//      constraints: 99b33768787ea0f5f1bc700226f9ed1a
//
// Method for collation-immune: md5 each line, sort those md5 strings,
// join by chr(10), md5 the result. Engine-agnostic because the sort key
// (the md5 of each line) is a fixed hex string, not the line itself.

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

function md5(s) {
  return createHash('md5').update(s, 'utf8').digest('hex');
}

function bytewiseFp(filePath) {
  const lines = readFileSync(filePath, 'utf-8').trim().split('\n').sort();
  return md5(lines.join('\n'));
}

function collationImmuneFp(filePath) {
  // md5(string_agg(md5(line), '' ORDER BY md5(line)))
  // Per-line md5s are 32-char hex strings, sorted bytewise (same on any
  // engine), concatenated without separator, then md5'd.
  const lines = readFileSync(filePath, 'utf-8').trim().split('\n');
  const lineHashes = lines.map(md5).sort();
  return md5(lineHashes.join(''));
}

const TARGETS = {
  column_fp_engine_sort: 'e9aa2888cf558480ef7266f3517becf7',
  constraint_fp_c_locale: '5568b4be09f8e8cef2851f8ed4ce9bef',
  columns_immune: 'e2f03afb5e7ebd0a6b6aca2a5d744d11',
  constraints_immune: '99b33768787ea0f5f1bc700226f9ed1a',
};

const results = {
  column_fp_engine_sort: bytewiseFp('scripts/.116b/rebuild-columns.txt'),
  constraint_fp_c_locale: bytewiseFp('scripts/.116b/rebuild-constraints-def.txt'),
  columns_immune: collationImmuneFp('scripts/.116b/rebuild-columns.txt'),
  constraints_immune: collationImmuneFp('scripts/.116b/rebuild-constraints-def.txt'),
};

let allMatch = true;
console.log('=== Final attestation ===\n');
for (const [name, target] of Object.entries(TARGETS)) {
  const ours = results[name];
  const ok = ours === target;
  if (!ok) allMatch = false;
  console.log(`${ok ? '[MATCH] ' : '[MISS]  '}${name}`);
  console.log(`        rebuild:    ${ours}`);
  console.log(`        production: ${target}`);
}
console.log(
  `\n${allMatch ? 'ALL FOUR FINGERPRINTS MATCH — byte-for-byte rebuild ≡ production' : 'AT LEAST ONE FINGERPRINT MISMATCH — investigate'}`,
);
process.exit(allMatch ? 0 : 1);
