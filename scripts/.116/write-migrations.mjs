// Writes migration files for groups M (new) + R (re-stamp) + C (already-correct rewrite).
// - Reads scripts/.116/manifest.json + scripts/.116/batches/batch-*.json
// - For each row: writes migrations/<version>_<name>[suffix].sql with body verbatim (UTF-8, LF)
// - For Group R + the WI-3 file already on main: deletes the old mis-stamped/comment-bloated file first
// - Skips Group P (pre-baseline, 22 files preserved as-is)
// - After writing every file, recomputes md5 from disk and asserts == manifest
//
// Run: node scripts/.116/write-migrations.mjs

import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const root = process.cwd();
const manifest = JSON.parse(readFileSync(join(root, 'scripts/.116/manifest.json'), 'utf-8'));
const expectedMd5 = Object.fromEntries(manifest.rows.map((r) => [r.version, r.body_md5]));
const expectedChars = Object.fromEntries(manifest.rows.map((r) => [r.version, r.chars]));
const renames = manifest._pre_existing_repo_files_for_group_R; // version -> old filename
const dupSuffix = manifest._disambiguator_suffix_for_dup_name; // version -> suffix

// Load all bodies.
const bodies = new Map(); // version -> { name, body }
for (let n = 1; n <= 6; n++) {
  const batch = JSON.parse(
    readFileSync(join(root, `scripts/.116/batches/batch-${n}.json`), 'utf-8'),
  );
  for (const row of batch) {
    // Get the canonical name from manifest (don't trust batch's missing-name).
    const manifestRow = manifest.rows.find((r) => r.version === row.version);
    if (!manifestRow) throw new Error(`No manifest row for ${row.version}`);
    bodies.set(row.version, { name: manifestRow.name, body: row.body });
  }
}

if (bodies.size !== manifest.rows.length) {
  throw new Error(`Body count mismatch: have ${bodies.size}, expected ${manifest.rows.length}`);
}

let renamed = 0,
  written = 0,
  deleted = 0;

// Step 1: delete old Group R files (mis-stamped, byte-divergent).
for (const [version, oldFilename] of Object.entries(renames)) {
  const oldPath = join(root, 'migrations', oldFilename);
  if (existsSync(oldPath)) {
    unlinkSync(oldPath);
    deleted++;
    console.log(
      `DELETED  migrations/${oldFilename}  (was Group R, will be re-stamped to ${version})`,
    );
  }
}

// Step 2: delete the already-correctly-stamped WI-3 file too (it has a header comment
// not present in production — would fail md5 check after rewrite). The new write will
// replace it verbatim.
for (const wi3Version of manifest._already_correctly_stamped_on_main_skip ?? []) {
  const { name } = bodies.get(wi3Version);
  const wi3Filename = `${wi3Version}_${name}.sql`;
  const wi3Path = join(root, 'migrations', wi3Filename);
  if (existsSync(wi3Path)) {
    unlinkSync(wi3Path);
    deleted++;
    console.log(`DELETED  migrations/${wi3Filename}  (WI-3, will be rewritten verbatim)`);
  }
}

// Step 3: write all 66 files verbatim.
for (const [version, { name, body }] of bodies) {
  const suffix = dupSuffix[version] ?? '';
  const filename = `${version}_${name}${suffix}.sql`;
  const path = join(root, 'migrations', filename);
  // Write the body as raw UTF-8. \n in the string stays as 0x0A on disk.
  writeFileSync(path, body, { encoding: 'utf-8' });
  written++;
}

// Step 4: re-verify md5 from disk for ALL 66.
// NOTE: only md5 is the integrity check. Production's `chars` column reports
// UTF-8 codepoint count; Buffer.length is byte count. They differ for bodies
// with multibyte chars (em-dashes etc.). md5(bytes) is what the runbook
// specifies and what chat-Claude will re-hash for attestation.
let pass = 0,
  fail = 0;
for (const [version, { name, body }] of bodies) {
  const suffix = dupSuffix[version] ?? '';
  const filename = `${version}_${name}${suffix}.sql`;
  const path = join(root, 'migrations', filename);
  const fileBytes = readFileSync(path); // Buffer
  const md5 = createHash('md5').update(fileBytes).digest('hex');
  if (md5 === expectedMd5[version]) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL  ${filename}  md5=${md5} (exp ${expectedMd5[version]})`);
  }
}

console.log(`\n=== Summary ===`);
console.log(`Deleted (Group R + WI-3 rewrite): ${deleted}`);
console.log(`Written (66 verbatim bodies):     ${written}`);
console.log(`Re-verified from disk:            ${pass} OK, ${fail} FAIL`);
if (fail > 0) {
  process.exit(1);
}
