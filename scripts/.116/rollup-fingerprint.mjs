// Set-level fidelity check per Task 1a.
//
// Computes:
//   md5( join( sort_by_version( "<version>:<md5(file_body)>" ), "|" ) )
//
// over the 66 versions in scripts/.116/manifest.json, reading each file's
// bytes from disk (as committed on this branch). Compares to the production
// fingerprint c407acae80ccf0896f09bcfb54016fae.

import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const EXPECTED = 'c407acae80ccf0896f09bcfb54016fae';

const root = process.cwd();
const manifest = JSON.parse(readFileSync(join(root, 'scripts/.116/manifest.json'), 'utf-8'));
const dupSuffix = manifest._disambiguator_suffix_for_dup_name ?? {};

// For each manifest version, find the file on disk by `<version>_*.sql`,
// compute md5(file_body), and pair as "version:md5".
const migDir = join(root, 'migrations');
const allFiles = readdirSync(migDir).filter((f) => f.endsWith('.sql'));

const pairs = [];
const perFileMd5 = [];
const localised = [];
for (const row of manifest.rows) {
  const suffix = dupSuffix[row.version] ?? '';
  const expectedName = `${row.version}_${row.name}${suffix}.sql`;
  const onDisk = allFiles.includes(expectedName)
    ? expectedName
    : allFiles.find((f) => f.startsWith(`${row.version}_`));
  if (!onDisk) {
    localised.push({ version: row.version, status: 'MISSING-FROM-DISK', expected: expectedName });
    continue;
  }
  const bytes = readFileSync(join(migDir, onDisk));
  const fileMd5 = createHash('md5').update(bytes).digest('hex');
  pairs.push({ version: row.version, file: onDisk, fileMd5, expectedMd5: row.body_md5 });
  perFileMd5.push({ version: row.version, fileMd5, expectedMd5: row.body_md5 });
  if (fileMd5 !== row.body_md5) {
    localised.push({
      version: row.version,
      file: onDisk,
      fileMd5,
      expectedMd5: row.body_md5,
      status: 'MD5-DIVERGES-FROM-MANIFEST',
    });
  }
}

if (localised.length > 0) {
  console.log('=== Per-file deviations ===');
  for (const d of localised) console.log(JSON.stringify(d));
  console.log('');
}

// Build the rollup: sorted by version, "version:md5" joined by "|", then md5.
pairs.sort((a, b) => a.version.localeCompare(b.version));
const joined = pairs.map((p) => `${p.version}:${p.fileMd5}`).join('|');
const rollup = createHash('md5').update(joined, 'utf-8').digest('hex');

console.log('=== Rollup ===');
console.log('Files included:        ' + pairs.length);
console.log('Localised deviations:  ' + localised.length);
console.log('Rollup md5:            ' + rollup);
console.log('Expected (production): ' + EXPECTED);
console.log('Match:                 ' + (rollup === EXPECTED ? 'YES' : 'NO'));

if (rollup !== EXPECTED || localised.length > 0) {
  process.exit(1);
}
