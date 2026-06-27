#!/usr/bin/env node
// Labour Hire Licensing Index — capture helper.
//
// The state labour hire registers are interactive search tools, not
// published totals, so the counts cannot be reliably fetched at build time.
// This script does NOT fabricate numbers. It (a) prints the exact manual
// capture steps per register, (b) safely writes captured integers into
// src/data/licensing-index.json and stamps the capture date, and (c) prints
// the current dataset.
//
// Usage:
//   node scripts/licensing-index-pull.mjs                 # instructions + current state
//   node scripts/licensing-index-pull.mjs --captured 2026-07-01 \
//        --set queensland.activeProviders=4123 \
//        --set queensland.pendingApplications=87
//
// Refresh cadence: quarterly minimum. Each run with --captured updates the
// dataset's capture date, which flows into the Dataset JSON-LD dateModified.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, '..', 'src', 'data', 'licensing-index.json');

const METRICS = ['activeProviders', 'suspended', 'cancelled', 'pendingApplications'];

// Where to capture each figure, per register (manual steps).
const CAPTURE_STEPS = {
  queensland:
    'QLD — ols.oir.qld.gov.au/licence-register/ : count Active; the Suspended, Cancelled and ' +
    'Pending Applications lists are separate tabs. Enforcement outcomes: labourhire.qld.gov.au.',
  victoria:
    'VIC — labourhireauthority.vic.gov.au Labour Hire Licence Register : filter by status for ' +
    'active vs suspended/cancelled.',
  'south-australia':
    'SA — sa.gov.au/topics/business-and-trade/licensing/labour-hire (Consumer and Business ' +
    'Services register) : count licensed providers.',
  'australian-capital-territory':
    'ACT — worksafe.act.gov.au/licensing-and-registration/labour-hire-licensing (WorkSafe ACT / ' +
    'Access Canberra register) : count licensed providers.',
};

function readData() {
  return JSON.parse(readFileSync(DATA, 'utf8'));
}

function printInstructions(data) {
  console.log('Labour Hire Licensing Index — manual capture');
  console.log(`Current capture date: ${data.capturedAt}`);
  console.log('');
  for (const [slug, steps] of Object.entries(CAPTURE_STEPS)) {
    console.log(`- ${steps}`);
  }
  console.log('');
  console.log('Current values:');
  for (const [slug, entry] of Object.entries(data.registers)) {
    const m = entry.metrics;
    console.log(
      `  ${slug}: ` + METRICS.map((k) => `${k}=${m[k] === null ? 'n/a' : m[k]}`).join(' '),
    );
  }
  console.log('');
  console.log('To record figures (only integers you have read off the register):');
  console.log(
    '  node scripts/licensing-index-pull.mjs --captured <YYYY-MM-DD> --set <slug>.<metric>=<int>',
  );
}

function main() {
  const args = process.argv.slice(2);
  const data = readData();

  if (args.length === 0) {
    printInstructions(data);
    return;
  }

  let capturedAt = null;
  const sets = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--captured') capturedAt = args[++i];
    else if (args[i] === '--set') sets.push(args[++i]);
    else {
      console.error(`[index] unknown argument: ${args[i]}`);
      process.exit(1);
    }
  }

  for (const pair of sets) {
    const m = /^([a-z-]+)\.([a-zA-Z]+)=(\d+)$/.exec(pair || '');
    if (!m) {
      console.error(`[index] bad --set "${pair}" (expected <slug>.<metric>=<int>)`);
      process.exit(1);
    }
    const [, slug, metric, valueStr] = m;
    if (!data.registers[slug]) {
      console.error(`[index] unknown jurisdiction "${slug}"`);
      process.exit(1);
    }
    if (!METRICS.includes(metric)) {
      console.error(`[index] unknown metric "${metric}" (one of ${METRICS.join(', ')})`);
      process.exit(1);
    }
    data.registers[slug].metrics[metric] = Number(valueStr);
    console.log(`[index] set ${slug}.${metric} = ${valueStr}`);
  }

  if (capturedAt) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(capturedAt)) {
      console.error('[index] --captured must be YYYY-MM-DD');
      process.exit(1);
    }
    data.capturedAt = capturedAt;
    console.log(`[index] capturedAt = ${capturedAt}`);
  }

  writeFileSync(DATA, JSON.stringify(data, null, 2) + '\n');
  console.log('[index] wrote src/data/licensing-index.json');
}

main();
