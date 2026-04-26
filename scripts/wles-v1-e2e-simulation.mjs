#!/usr/bin/env node
/* eslint-disable */
// WLES v1.0 end-to-end code-path simulation.
//
// Exercises the exact builder → seal → chain-link → export code path
// that /field, /api/verify/*, /api/command/* routes will use after
// callsite switchover (per transition policy §5c). The only thing
// missing vs. the real HTTP route is the Supabase INSERT — which is
// pure byte storage and cannot affect hash correctness.
//
// Simulates Joao's full shift at Googong (SHIFT_COMMIT →
// CLOCK_IN → BREAK_START → BREAK_END → CLOCK_OUT → APPROVAL →
// INTELLIGENCE_CLEAR), produces a WLES v1.0 JSON export, writes it
// to disk, then invokes the INDEPENDENT verifier.
//
// Usage:
//   # 1. Compile the TS source once:
//   npx tsc --outDir tmp-sim --target es2022 --module es2022 \
//     --moduleResolution node --esModuleInterop --skipLibCheck \
//     src/lib/wles/v1.ts src/lib/wles/v1-types.ts src/lib/wles/v1-translate.ts
//   # 2. Run:
//   node scripts/wles-v1-e2e-simulation.mjs
//
// The compiled imports are from tmp-sim/ — the JS output of the very
// same TypeScript modules /field will call post-switchover. No
// divergence.

import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Import the real builders + sealer (TypeScript-compiled, CommonJS).
// createRequire lets this ESM script pull the CJS output cleanly.
const require = createRequire(import.meta.url);
const {
  buildShiftCommit, buildClockIn, buildClockOut,
  buildBreakStart, buildBreakEnd,
  buildApproval, buildIntelligenceClear,
} = require('../tmp-sim/v1-translate.js');
const { sealEvent, ZERO_HASH } = require('../tmp-sim/v1.js');

// ──────────────────────────────────────────────────────────────────────
// Domain inputs for Joao's rehearsal
// ──────────────────────────────────────────────────────────────────────
const SITE    = 'e2e00000-0000-0000-0000-000000000002'; // Googong
const WORKER  = 'e2e00000-0000-0000-0000-000000000003'; // Joao
const SUPER   = 'e2e00000-0000-0000-0000-000000000004'; // Lauren
const SHIFT   = 'e2e00000-0000-0000-0000-000000000100'; // This shift
const SYSTEM  = 'ffffffff-0000-0000-0000-000000000000'; // FLOSMOSIS system

const events = [];
let prevHash = ZERO_HASH;

function step(built) {
  const sealed = sealEvent(built);
  events.push(sealed);
  prevHash = sealed.event_hash;
}

// 1. SHIFT_COMMIT (night before)
step(buildShiftCommit({
  eventId: 'e2e00000-0000-0000-0000-000000000201',
  actorId: SUPER, subjectId: WORKER,
  timestamp: '2026-04-26T17:00:00.000Z',
  previousEventHash: prevHash,
  shiftId: SHIFT, siteId: SITE,
  scheduledStart: '2026-04-27T07:00:00.000Z',
  scheduledEnd: '2026-04-27T15:00:00.000Z',
}));

// 2. CLOCK_IN (morning of, geofence-detected)
step(buildClockIn({
  eventId: 'e2e00000-0000-0000-0000-000000000202',
  actorId: WORKER, subjectId: WORKER,
  timestamp: '2026-04-27T07:02:14.521Z',
  previousEventHash: prevHash,
  shiftId: SHIFT, siteId: SITE,
  detectionMethod: 'geofence',
  geofenceDetectedAt: '2026-04-27T07:02:14.521Z',
  metadata: {
    geolocation: { latitude: -35.470012, longitude: 149.221034, accuracy: 8.2 },
    app_version: 'flostruction/1.0.0',
  },
}));

// 3. BREAK_START (meal break at 10:30)
step(buildBreakStart({
  eventId: 'e2e00000-0000-0000-0000-000000000203',
  actorId: WORKER, subjectId: WORKER,
  timestamp: '2026-04-27T10:30:00.000Z',
  previousEventHash: prevHash,
  shiftId: SHIFT, breakType: 'meal',
  metadata: { app_version: 'flostruction/1.0.0' },
}));

// 4. BREAK_END (back at 11:00)
step(buildBreakEnd({
  eventId: 'e2e00000-0000-0000-0000-000000000204',
  actorId: WORKER, subjectId: WORKER,
  timestamp: '2026-04-27T11:00:00.000Z',
  previousEventHash: prevHash,
  shiftId: SHIFT,
  breakStartEventId: 'e2e00000-0000-0000-0000-000000000203',
  metadata: { app_version: 'flostruction/1.0.0' },
}));

// 5. CLOCK_OUT (end of shift)
step(buildClockOut({
  eventId: 'e2e00000-0000-0000-0000-000000000205',
  actorId: WORKER, subjectId: WORKER,
  timestamp: '2026-04-27T15:02:47.108Z',
  previousEventHash: prevHash,
  shiftId: SHIFT, siteId: SITE,
  workerConfirmedStartAt: '2026-04-27T07:00:00.000Z',
  startTimeSource: 'worker_confirmed',
  metadata: {
    geolocation: { latitude: -35.470007, longitude: 149.221028, accuracy: 6.4 },
    app_version: 'flostruction/1.0.0',
  },
}));

// 6. APPROVAL (Lauren replies YES ALL via SMS)
step(buildApproval({
  eventId: 'e2e00000-0000-0000-0000-000000000206',
  actorId: SUPER, subjectId: WORKER,
  timestamp: '2026-04-27T15:45:03.422Z',
  previousEventHash: prevHash,
  shiftId: SHIFT, approvedHours: 7.54, approvalMethod: 'sms',
  metadata: { app_version: 'flostruction/1.0.0' },
}));

// 7. INTELLIGENCE_CLEAR (automated post-approval check)
step(buildIntelligenceClear({
  eventId: 'e2e00000-0000-0000-0000-000000000207',
  actorId: SYSTEM, subjectId: WORKER,
  timestamp: '2026-04-27T15:45:04.000Z',
  previousEventHash: prevHash,
  shiftId: SHIFT,
  checksPerformed: ['geofence_bounds', 'duration_sanity', 'supervisor_identity_match', 'break_duration_reasonable'],
  checkVersion: 'flostruction/1.0.0',
}));

// Assemble the WLES export
const exportDoc = {
  receipt_id: 'FSTR-E2E00001',
  spec_version: '1.0',
  description: "Joao's 2026-04-27 full-shift rehearsal at Googong. Sealed via v1-translate + sealEvent — the exact code /field will invoke after callsite switchover. No DB write in this simulation; DB I/O cannot affect hash correctness (jsonb stores bytes verbatim).",
  source: 'wles-v1-e2e-simulation.mjs',
  events,
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outPath = join(__dirname, '..', 'tmp-e2e-joao-shift.json');
writeFileSync(outPath, JSON.stringify(exportDoc, null, 2) + '\n');
console.log('Simulated export written to:', outPath);
console.log('Chain length:', events.length, 'events');
console.log('Chain genesis previous_event_hash:', events[0].previous_event_hash);
console.log('Chain head event_hash:', events[events.length - 1].event_hash);
console.log();
console.log('─'.repeat(70));
console.log('Running INDEPENDENT verifier (scripts/wles-v1-verify.mjs):');
console.log('─'.repeat(70));
console.log();

const verifierPath = join(__dirname, 'wles-v1-verify.mjs');
const result = spawnSync('node', [verifierPath, outPath], {
  stdio: 'inherit',
  encoding: 'utf8',
});
console.log();
console.log('verifier exit code:', result.status);
process.exit(result.status ?? 1);
