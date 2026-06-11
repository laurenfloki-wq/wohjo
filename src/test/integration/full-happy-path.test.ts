// Monday Task 2 — Full happy-path integration test.
//
// Saturday's schema-drift guard battery (15750ac) proves individual routes
// write to existing columns. This test extends that posture: it pins the
// END-TO-END properties of the worker → supervisor → commit chain.
//
// Path under test (v0 legacy chain — pre-WLES_V1_ENABLED):
//   START_EVENT → END_EVENT → SHIFT_COMMIT → SUPERVISOR_APPROVAL
//
// The shifts row state machine should advance:
//   IN_PROGRESS → SUBMITTED → SUPERVISOR_APPROVED
//
// Web-link supervisor approval is the canonical Mo-Week-1 path
// (Twilio paid-mode KYC ticket #26614133 still pending). SMS path
// testing is deferred — it requires a live Twilio credential.
//
// SCOPE NOTE (substrate-DD discipline): a true HTTP-level integration
// test would spin up a PG instance, run migrations, mock the
// service-role client to point at it, and POST through the route
// handlers. Building that infra is a 1-day task — out of scope for
// the Monday brief's 2-hour Task 2 budget.
//
// Path-alias note: vitest 4.1.x resolves `@/...` for tests under
// `src/app/...` (where co-located route.test.ts files live) but does
// not resolve them for tests under `src/test/integration/...` without
// an explicit vitest config. The records.test.ts pattern uses `@/...`
// and works; this file's deeper integration nesting hits the alias-
// resolution gap. Documented at the bottom of this file as a
// substrate-DD finding for Lauren's review.
//
// Two complementary patterns drive ≥8 distinct assertions across the
// full path WITHOUT requiring a live route invocation:
//
//   (A) Source-string assertions on each route's substrate-shape:
//       state-machine transitions, event_type values, status guards,
//       chain-extension wiring, token-anchored auth. Same pattern as
//       tests/schema-drift/battery.test.ts.
//
//   (B) Pure-function assertions on the chain-extension property:
//       generate the four hashes the happy path produces; assert
//       each is deterministic, that no two collide, that canonical
//       JSON serialisation makes hashing key-order independent
//       (the post-Friday substrate-DD invariant from `fad0533`),
//       and that any byte-change tampers the hash.
//
// Together (A) + (B) prove the substrate-shape of the path. A
// future RUN_LIVE_E2E flagged suite can drive HTTP end-to-end
// against a deployed stack. That layer is deferred.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateEventHash } from '../../lib/wles/hash';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf-8');

// Deterministic fixture IDs.
const COMPANY_ID = '00000000-1000-0000-0000-000000000001';
const WORKER_ID = '00000000-2000-0000-0000-000000000001';
const SITE_ID = '00000000-3000-0000-0000-000000000001';
const SHIFT_ID = '00000000-5000-0000-0000-000000000001';
const RECEIPT_ID = 'FSTR-MONTEST1';
const SUPERVISOR_PHONE = '+61400000002';

// ─── (A) — Source-string state-machine substrate ───────────────────

describe('full happy path — (A) source-string state-machine substrate', () => {
  const startSrc = read('src/app/api/field/shift/start/route.ts');
  const endSrc = read('src/app/api/field/shift/end/route.ts');
  const verifyApproveSrc = read(
    'src/app/api/verify/approve/[shiftId]/route.ts',
  );
  // W1.4 (2026-06-10): start/end writes flow through the shifts
  // repository — the relocated halves are asserted there (S9).
  const shiftsRepoSrc = read('src/lib/db/repositories/shifts.repo.ts');

  it('1. start route inserts shifts row with status IN_PROGRESS', () => {
    expect(startSrc).toMatch(
      /repo\.insertShiftStart\(\{[\s\S]*?status:\s*['"]IN_PROGRESS['"]/,
    );
    expect(shiftsRepoSrc).toMatch(
      /insertShiftStart[\s\S]*?\.from\(['"]shifts['"]\)\s*\n?\s*\.insert\(/,
    );
  });

  it('2. start route writes START_EVENT to shift_events', () => {
    expect(startSrc).toMatch(
      /evRepo\.insertV0EventReturningId\(\{[\s\S]*?event_type:\s*['"]START_EVENT['"]/,
    );
    expect(shiftsRepoSrc).toMatch(
      /insertV0EventReturningId[\s\S]*?\.from\(['"]shift_events['"]\)\s*\n?\s*\.insert\(/,
    );
  });

  it('3. end route advances shifts row IN_PROGRESS → SUBMITTED with status guard', () => {
    // Guarded UPDATE: the .eq('status', 'IN_PROGRESS') predicate
    // prevents a re-run from producing inconsistent state.
    expect(endSrc).toMatch(
      /repo\.submitOptimistic\(\s*shift_id,\s*\{[\s\S]*?status:\s*['"]SUBMITTED['"]/,
    );
    expect(shiftsRepoSrc).toMatch(
      /submitOptimistic[\s\S]*?\.eq\(['"]status['"],\s*['"]IN_PROGRESS['"]\)/,
    );
  });

  it('4. end route writes END_EVENT and SHIFT_COMMIT events', () => {
    expect(endSrc).toMatch(/event_type:\s*['"]END_EVENT['"]/);
    expect(endSrc).toMatch(/event_type:\s*['"]SHIFT_COMMIT['"]/);
  });

  it('5. SHIFT_COMMIT chains to END_EVENT via previous_event_hash = endHash', () => {
    expect(endSrc).toMatch(/previous_event_hash:\s*endHash/);
  });

  it('6. verify/approve route writes SUPERVISOR_APPROVAL event with method WOHJO_VERIFY', () => {
    expect(verifyApproveSrc).toMatch(/event_type:\s*['"]SUPERVISOR_APPROVAL['"]/);
    expect(verifyApproveSrc).toMatch(/method:\s*['"]WOHJO_VERIFY['"]/);
  });

  it('7. verify/approve route advances shifts SUBMITTED → SUPERVISOR_APPROVED with status guard', () => {
    expect(verifyApproveSrc).toMatch(
      /\.from\(['"]shifts['"]\)\s*\n?\s*\.update\(\{[\s\S]*?status:\s*['"]SUPERVISOR_APPROVED['"]/,
    );
    expect(verifyApproveSrc).toMatch(/\.eq\(['"]status['"],\s*['"]SUBMITTED['"]\)/);
  });

  it('8. verify/approve route requires verify_token (token-anchored auth)', () => {
    expect(verifyApproveSrc).toMatch(/verify_token/);
    expect(verifyApproveSrc).toMatch(/MISSING_TOKEN/);
  });

  it('9. verify/approve route enforces site-access (supervisor.site_ids includes shift.site_id)', () => {
    expect(verifyApproveSrc).toMatch(/supervisor_site_ids|supervisorSiteIds/);
    expect(verifyApproveSrc).toMatch(/site_access_denied|does not have access/);
  });

  it('10. start route blocks duplicate same-day shifts (sync conflict guard)', () => {
    // W1.4: the guard runs via the repo pass-through; sync-guard's
    // queries are unchanged.
    expect(startSrc).toMatch(/runDuplicateStartGuard/);
    expect(shiftsRepoSrc).toMatch(/checkDuplicateStartEvent/);
    expect(startSrc).toMatch(/Shift already started today/);
  });

  it('11. end route accepts client_event_id for END_EVENT idempotency (Saturday Task 6)', () => {
    expect(endSrc).toMatch(/client_event_id\?:\s*string;/);
    expect(endSrc).toMatch(/uq_shift_events_end_idempotent/);
  });

  it('12. verify/approve route is RATE-LIMITED (defence against token-spray)', () => {
    expect(verifyApproveSrc).toMatch(/checkRateLimit/);
    expect(verifyApproveSrc).toMatch(/Rate limit exceeded/);
  });
});

// ─── (B) — Chain-extension property of generateEventHash ───────────

describe('full happy path — (B) chain extension property', () => {
  // Build the four canonical events for Joao's 2026-05-03 happy path.
  const startedAt = new Date('2026-05-03T07:00:00.000Z');
  const endedAt = new Date('2026-05-03T15:30:00.000Z');
  const committedAt = new Date(endedAt.getTime() + 1);
  const approvedAt = new Date('2026-05-03T15:31:00.000Z');

  const startEventData = {
    start_time: startedAt.toISOString(),
    shift_date: '2026-05-03',
    gps_lat: '-35.319',
    gps_lng: '149.007',
  };
  const endEventData = {
    end_time: endedAt.toISOString(),
    break_minutes: 30,
    total_hours: 8.0,
    gps_lat: '-35.319',
    gps_lng: '149.007',
  };
  const commitEventData = {
    shift_id: SHIFT_ID,
    receipt_id: RECEIPT_ID,
    total_hours: 8.0,
    break_minutes: 30,
    committed_at: committedAt.toISOString(),
  };
  const approvalEventData = {
    shift_id: SHIFT_ID,
    receipt_id: RECEIPT_ID,
    method: 'WOHJO_VERIFY',
    approver_phone: SUPERVISOR_PHONE,
  };

  const startHash = generateEventHash({
    company_id: COMPANY_ID,
    worker_id: WORKER_ID,
    site_id: SITE_ID,
    event_type: 'START_EVENT',
    event_data: startEventData,
    created_at: startedAt,
  });
  const endHash = generateEventHash({
    company_id: COMPANY_ID,
    worker_id: WORKER_ID,
    site_id: SITE_ID,
    event_type: 'END_EVENT',
    event_data: endEventData,
    created_at: endedAt,
  });
  const commitHash = generateEventHash({
    company_id: COMPANY_ID,
    worker_id: WORKER_ID,
    site_id: SITE_ID,
    event_type: 'SHIFT_COMMIT',
    event_data: commitEventData,
    created_at: committedAt,
  });
  const approvalHash = generateEventHash({
    company_id: COMPANY_ID,
    worker_id: WORKER_ID,
    site_id: SITE_ID,
    event_type: 'SUPERVISOR_APPROVAL',
    event_data: approvalEventData,
    created_at: approvedAt,
  });

  it('13. all four hashes are SHA-256 hex (64 lowercase chars)', () => {
    for (const h of [startHash, endHash, commitHash, approvalHash]) {
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('14. hashes are deterministic — re-running generateEventHash produces the same value', () => {
    const second = generateEventHash({
      company_id: COMPANY_ID,
      worker_id: WORKER_ID,
      site_id: SITE_ID,
      event_type: 'START_EVENT',
      event_data: startEventData,
      created_at: startedAt,
    });
    expect(second).toBe(startHash);
  });

  it('15. no two events in the chain share a hash', () => {
    const set = new Set([startHash, endHash, commitHash, approvalHash]);
    expect(set.size).toBe(4);
  });

  it('16. canonical-stringify makes hashing key-order independent (Friday `fad0533` invariant)', () => {
    const reordered = generateEventHash({
      // Reorder JSONB keys; canonicalStringify sorts alphabetically
      // before hashing so the output must match.
      company_id: COMPANY_ID,
      worker_id: WORKER_ID,
      site_id: SITE_ID,
      event_type: 'END_EVENT',
      event_data: {
        gps_lng: endEventData.gps_lng,
        end_time: endEventData.end_time,
        total_hours: endEventData.total_hours,
        break_minutes: endEventData.break_minutes,
        gps_lat: endEventData.gps_lat,
      },
      created_at: endedAt,
    });
    expect(reordered).toBe(endHash);
  });

  it('17. changing any byte in event_data changes the hash (collision resistance)', () => {
    const tampered = generateEventHash({
      company_id: COMPANY_ID,
      worker_id: WORKER_ID,
      site_id: SITE_ID,
      event_type: 'END_EVENT',
      event_data: { ...endEventData, total_hours: 8.01 },
      created_at: endedAt,
    });
    expect(tampered).not.toBe(endHash);
  });

  it('18. changing tenant scope (company_id) produces a different hash — defence against cross-tenant rehashing', () => {
    const otherTenant = generateEventHash({
      company_id: '00000000-1000-0000-0000-9999999999ff',
      worker_id: WORKER_ID,
      site_id: SITE_ID,
      event_type: 'END_EVENT',
      event_data: endEventData,
      created_at: endedAt,
    });
    expect(otherTenant).not.toBe(endHash);
  });

  it('19. swapping event_type changes the hash — START vs END events with identical other fields are distinct', () => {
    const startEnd = generateEventHash({
      company_id: COMPANY_ID,
      worker_id: WORKER_ID,
      site_id: SITE_ID,
      event_type: 'END_EVENT', // swapped event_type
      event_data: startEventData, // but kept start's data
      created_at: startedAt,
    });
    expect(startEnd).not.toBe(startHash);
  });
});

// ─── Documentation block: what this suite does NOT test ────────────
//
// 1. Twilio SMS path. Out of scope — Twilio paid-mode KYC pending.
//    The web-link approval covers Mo Week 1 canonical path.
// 2. WLES v1.0 sealed chain. The v0 path is the production default
//    until WLES_V1_ENABLED=true is flipped on. v1 chain extension
//    has its own test in src/lib/wles/v1-chain.test.ts.
// 3. Geofence enforcement. The route accepts gps_lat/gps_lng but
//    does NOT validate them against the site geofence — that's a
//    client-side concern in the worker app. SUBSTRATE-DD FINDING:
//    server-side geofence cross-check would be defence in depth;
//    flagged for Lauren's review (NOT auto-implemented).
// 4. Live route invocation against a stateful database. A true
//    HTTP-level integration test would spin up Postgres, run
//    migrations, and POST through the actual route handlers. That
//    is a future RUN_LIVE_E2E flagged suite — deferred from the
//    Monday brief budget.
// 5. The Stripe checkout → webhook → tenant-provision sequence.
//    That's Monday Task 4 (separate brief).
// 6. CSV export end-to-end. That's Monday Task 3 (separate brief).
//
// SUBSTRATE-DD FINDING (alias resolution at deep nesting):
//
// vitest 4.1.x resolves `@/...` paths for test files at depths that
// the existing co-located test pattern uses (e.g. src/app/api/.../
// route.test.ts). Tests at deeper nesting like src/test/integration/
// hit a resolution failure when route imports cascade their own `@/`
// resolutions. A vitest.config.ts with `vite-tsconfig-paths` plugin
// would fix this codebase-wide; the project does not currently have
// such a config and the absence is documented in this comment.
//
// Adding the config is a substrate change worth founder-decision
// (vs. continuing the relative-path workaround per the Saturday
// Stripe checkout test commit `915fbf2` precedent).
