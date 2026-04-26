#!/usr/bin/env node
/* eslint-disable */
// WLES v1.0 — independent reference verifier
// Published 2026-04-24 alongside WLES v1.0 Specification.
//
// This verifier is a from-scratch implementation of WLES v1.0
// Sections 5 (canonical serialisation), 6 (hash algorithm), and 8
// (verification protocol). It depends ONLY on Node.js built-ins
// (`crypto`, `fs`) — NO dependency on the FLOSTRUCTION reference
// implementation code paths (`src/lib/wles/*`).
//
// This is the tool an independent auditor, acquirer's inspector,
// or third-party implementer should use to confirm that a chain of
// WLES v1.0 events is genuinely conformant.
//
// Usage:
//   node scripts/wles-v1-verify.mjs <path/to/events.json> [--json]
//
// Input formats accepted:
//   (a) A "test vector" file as published at wles.io/spec/v1.0/test-
//       vectors — has top-level fields {id, spec_version, events, ...}
//   (b) A bare chain — top-level JSON array of events
//   (c) A FLOSTRUCTION API response — top-level {receipt_id, events, ...}
//
// The verifier detects the shape from the keys present.
//
// Exit codes:
//   0 — all events self-verify AND chain linkage is correct AND
//       (if present) expected_verification.chain_verification === "pass"
//   1 — any event fails single-event verification, OR chain linkage
//       is broken, OR (if the test vector expects a failure) the
//       expected failure was NOT detected
//   2 — usage error (bad arguments, file not found, not JSON)

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { argv, exit } from 'node:process';

// ──────────────────────────────────────────────────────────────────────
// CLI
// ──────────────────────────────────────────────────────────────────────
function usage(exitCode = 2) {
  process.stderr.write(
    'Usage: node scripts/wles-v1-verify.mjs <path/to/events.json> [--json]\n' +
    '\n' +
    'Verifies a WLES v1.0 chain against the spec. Exits 0 if pass.\n' +
    '--json emits a machine-readable result envelope on stdout.\n'
  );
  exit(exitCode);
}

const args = argv.slice(2);
if (args.length < 1 || args.includes('-h') || args.includes('--help')) usage();

const path = args.find((a) => !a.startsWith('-'));
const jsonOutput = args.includes('--json');

if (!path) usage();

let inputText;
try {
  inputText = readFileSync(path, 'utf8');
} catch (err) {
  process.stderr.write(`error: cannot read ${path}: ${err.message}\n`);
  exit(2);
}

let input;
try {
  input = JSON.parse(inputText);
} catch (err) {
  process.stderr.write(`error: ${path} is not valid JSON: ${err.message}\n`);
  exit(2);
}

// ──────────────────────────────────────────────────────────────────────
// Extract event list from any of the three supported shapes
// ──────────────────────────────────────────────────────────────────────
let events;
let expectedVerification;
let sourceShape;
if (Array.isArray(input)) {
  events = input;
  sourceShape = 'bare-array';
} else if (Array.isArray(input.events)) {
  events = input.events;
  sourceShape = input.id ? 'test-vector' : (input.receipt_id ? 'api-receipt' : 'object-with-events');
  expectedVerification = input.expected_verification;
} else {
  process.stderr.write(
    `error: ${path} does not contain a WLES chain. Expected either a bare\n` +
    `JSON array of events, an object with an "events" array, or a published\n` +
    `test vector with {events, expected_verification}.\n`
  );
  exit(2);
}

// ──────────────────────────────────────────────────────────────────────
// §5 — Canonical serialisation
// ──────────────────────────────────────────────────────────────────────
const ZERO_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

function canonicaliseValue(v) {
  if (v === null) return 'null';
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`non-finite number not permitted: ${v}`);
    return JSON.stringify(v);
  }
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicaliseValue).join(',') + ']';
  if (typeof v === 'object') {
    const keys = Object.keys(v).filter((k) => v[k] !== undefined);
    keys.sort(); // code-unit sort — equivalent to code-point for ASCII WLES keys
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicaliseValue(v[k])).join(',') + '}';
  }
  throw new Error(`unsupported value type: ${typeof v}`);
}

function canonicaliseEvent(event) {
  // Spec §5.1: event_hash field is excluded from the hash input.
  // We explicitly enumerate the other fields rather than using
  // destructure-exclusion, to catch typos/stray fields.
  const input = {
    actor_id: event.actor_id,
    event_id: event.event_id,
    event_type: event.event_type,
    payload: event.payload,
    previous_event_hash: event.previous_event_hash,
    subject_id: event.subject_id,
    timestamp: event.timestamp,
  };
  if (event.metadata !== undefined) input.metadata = event.metadata;
  return canonicaliseValue(input);
}

// ──────────────────────────────────────────────────────────────────────
// §6 — SHA-256 over canonical UTF-8 bytes
// ──────────────────────────────────────────────────────────────────────
function hashEvent(event) {
  return createHash('sha256').update(canonicaliseEvent(event), 'utf8').digest('hex');
}

// ──────────────────────────────────────────────────────────────────────
// Validation helpers
// ──────────────────────────────────────────────────────────────────────
const SHA256_RE = /^[0-9a-f]{64}$/;
const UUID_RE   = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ISO_RE    = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const COMMITTED_TYPES = new Set([
  'SHIFT_COMMIT','CLOCK_IN','CLOCK_OUT','BREAK_START','BREAK_END','APPROVAL','INTELLIGENCE_CLEAR','ANOMALY_FLAG'
]);

function isValidEventType(t) {
  return typeof t === 'string' && (
    COMMITTED_TYPES.has(t) || /^X-[A-Z0-9_]+-[A-Z0-9_]+/i.test(t)
  );
}

// ──────────────────────────────────────────────────────────────────────
// §8.1 single-event verification
// ──────────────────────────────────────────────────────────────────────
function verifySingle(event, index) {
  const failures = [];
  const required = ['event_id','event_type','event_hash','previous_event_hash','actor_id','subject_id','timestamp','payload'];
  for (const f of required) {
    if (event[f] === undefined || event[f] === null) {
      failures.push({ index, event_id: event.event_id ?? '<unknown>', reason: 'MISSING_REQUIRED_FIELD', message: `missing ${f}` });
    }
  }
  if (failures.length) return failures;

  if (!UUID_RE.test(event.event_id)) {
    failures.push({ index, event_id: event.event_id, reason: 'MALFORMED_FIELD', message: `event_id is not a valid UUID v4: ${event.event_id}` });
  }
  if (!isValidEventType(event.event_type)) {
    failures.push({ index, event_id: event.event_id, reason: 'INVALID_EVENT_TYPE', message: `event_type "${event.event_type}" is neither a committed type nor a valid X- extension` });
  }
  if (!SHA256_RE.test(event.event_hash)) {
    failures.push({ index, event_id: event.event_id, reason: 'MALFORMED_HASH', message: `event_hash must be 64 lowercase hex chars: ${event.event_hash}` });
  }
  if (!SHA256_RE.test(event.previous_event_hash)) {
    failures.push({ index, event_id: event.event_id, reason: 'MALFORMED_PREVIOUS_HASH', message: `previous_event_hash must be 64 lowercase hex chars: ${event.previous_event_hash}` });
  }
  if (!ISO_RE.test(event.timestamp)) {
    failures.push({ index, event_id: event.event_id, reason: 'MALFORMED_TIMESTAMP', message: `timestamp must match ISO 8601 UTC ms precision with Z: ${event.timestamp}` });
  }

  if (failures.length) return failures;

  // Hash check
  const { event_hash, ...unsealed } = event;
  let expected;
  try {
    expected = hashEvent(unsealed);
  } catch (err) {
    failures.push({ index, event_id: event.event_id, reason: 'CANONICALISATION_ERROR', message: err.message });
    return failures;
  }
  if (expected !== event_hash) {
    failures.push({ index, event_id: event.event_id, reason: 'HASH_MISMATCH', expected, actual: event_hash });
  }
  return failures;
}

// ──────────────────────────────────────────────────────────────────────
// §8.2 chain verification
// ──────────────────────────────────────────────────────────────────────
function verifyChain(events) {
  const failures = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    failures.push(...verifySingle(ev, i));
    if (i === 0) {
      if (ev.previous_event_hash !== ZERO_HASH) {
        failures.push({ index: i, event_id: ev.event_id, reason: 'GENESIS_LINK_INVALID', expected: ZERO_HASH, actual: ev.previous_event_hash });
      }
    } else {
      const prev = events[i - 1];
      if (ev.previous_event_hash !== prev.event_hash) {
        failures.push({ index: i, event_id: ev.event_id, reason: 'PREVIOUS_LINK_BROKEN', expected: prev.event_hash, actual: ev.previous_event_hash });
      }
    }
  }
  return { ok: failures.length === 0, events_scanned: events.length, failures };
}

// ──────────────────────────────────────────────────────────────────────
// Run
// ──────────────────────────────────────────────────────────────────────
const result = verifyChain(events);

// If the file is a published test vector with expected_verification,
// cross-check the verifier's output against the expected result.
let testVectorResult = null;
if (expectedVerification) {
  const expectPass = expectedVerification.chain_verification === 'pass';
  const actualPass = result.ok;
  testVectorResult = {
    expected: expectedVerification.chain_verification,
    actual: actualPass ? 'pass' : 'fail',
    agrees: expectPass === actualPass,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Output
// ──────────────────────────────────────────────────────────────────────
if (jsonOutput) {
  const envelope = {
    file: path,
    source_shape: sourceShape,
    spec_version: '1.0',
    events_scanned: result.events_scanned,
    chain_verification: result.ok ? 'pass' : 'fail',
    failures: result.failures,
  };
  if (testVectorResult) envelope.test_vector = testVectorResult;
  process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
} else {
  // Human-readable
  const BOLD = '\x1b[1m'; const RED = '\x1b[31m'; const GREEN = '\x1b[32m'; const RESET = '\x1b[0m';
  const c = process.stdout.isTTY;
  const bold = (s) => c ? BOLD + s + RESET : s;
  const red  = (s) => c ? RED + s + RESET : s;
  const grn  = (s) => c ? GREEN + s + RESET : s;

  process.stdout.write(bold('WLES v1.0 verifier') + ' — file: ' + path + '\n');
  process.stdout.write('source shape: ' + sourceShape + '\n');
  process.stdout.write('events scanned: ' + result.events_scanned + '\n');
  if (result.ok) {
    process.stdout.write('chain verification: ' + grn('PASS') + '\n');
  } else {
    process.stdout.write('chain verification: ' + red('FAIL') + '\n');
    process.stdout.write('\nfailures:\n');
    for (const f of result.failures) {
      process.stdout.write(`  [#${f.index}] ${f.event_id} — ${red(f.reason)}\n`);
      if (f.expected) process.stdout.write(`      expected: ${f.expected}\n`);
      if (f.actual)   process.stdout.write(`      actual:   ${f.actual}\n`);
      if (f.message)  process.stdout.write(`      ${f.message}\n`);
    }
  }

  if (testVectorResult) {
    process.stdout.write('\ntest vector expectation: ' + testVectorResult.expected + '\n');
    process.stdout.write('test vector actual:      ' + testVectorResult.actual + '\n');
    if (testVectorResult.agrees) {
      process.stdout.write('verifier agrees with test vector: ' + grn('YES') + '\n');
    } else {
      process.stdout.write('verifier agrees with test vector: ' + red('NO') + '  ← conformance break\n');
    }
  }
}

// Decide exit code
let exitCode = 0;
if (!result.ok) exitCode = 1;
if (testVectorResult) {
  // For a published test vector, the verifier must agree with the
  // expected verification result. If it disagrees, that's a bug.
  if (!testVectorResult.agrees) exitCode = 1;
  // A "fail"-expected test vector is EXPECTED to fail, so the
  // verifier's failure is the correct outcome.
  if (testVectorResult.expected === 'fail' && testVectorResult.actual === 'fail') {
    exitCode = 0;
  }
}
exit(exitCode);
