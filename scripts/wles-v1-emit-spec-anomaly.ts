// FLOSTRUCTION — M2: X-FLOSMOSIS-SPEC_VERSION_ANOMALY emitter.
//
// Mints ONE annotation event into shift_events that explains the two
// 2026-06-05 mis-stamped rows (d6249c3a PAYROLL_APPROVAL,
// e22ee9fd EXPORT_RECORD). Payload-level attestation only — the
// annotation chains off the v1 tail and references the affected v0
// hashes IN ITS SIGNED PAYLOAD; it does NOT chain to them via
// previous_event_hash.
//
// Append-only. Re-running this script will mint a second annotation
// row only if the operator removes the idempotency guard below; the
// guard refuses to mint if any X-FLOSMOSIS-SPEC_VERSION_ANOMALY row
// already exists for the company.
//
// Pre-flight: M0 + M1 must be live. WLES_V1_ENABLED is irrelevant
// here — the script imports the sealing helpers directly with a
// service-role client.

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();
import { createClient } from '@supabase/supabase-js';
import { getV1ChainTail, insertV1Event, FLOSMOSIS_SYSTEM_ACTOR_ID } from '../src/lib/wles/v1-chain';
import { sealEvent } from '../src/lib/wles/v1';
import { buildSpecVersionAnomaly } from '../src/lib/wles/v1-translate';

const COMPANY_ID = process.env.WLES_BOOTSTRAP_COMPANY_ID
  ?? '00000000-1000-0000-0000-000000000001';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// The two anomaly rows that this annotation explains. Pinned by id so
// any future row with the same hash can never be conflated.
const AFFECTED = [
  {
    id: 'd6249c3a-9fe9-458c-87c0-b396f8af09c2',
    hash: 'd86404dc70fa0a039835c438bf75f9c463fd71e76d0f56d175511e2f8e9cb3c1',
    type: 'PAYROLL_APPROVAL',
    at: '2026-06-05T04:18:52.419Z',
  },
  {
    id: 'e22ee9fd-5c89-45fe-a264-ba928ab6b01f',
    hash: '92fbeca77eab1576436ee0eaf57ebaed2102fdd5f3f52275a34f1bae4e62e0d2',
    type: 'EXPORT_RECORD',
    at: '2026-06-05T04:19:10.049Z',
  },
];

async function main() {
  console.log('M2 emitter — X-FLOSMOSIS-SPEC_VERSION_ANOMALY');
  console.log(`Company: ${COMPANY_ID}`);

  // Idempotency: refuse to mint a second annotation. Append-only
  // means we cannot delete a previous mint; re-running this script
  // would just append another row, which is not what we want.
  const { data: priorAnnotation } = await supabase
    .from('shift_events')
    .select('id, event_hash, created_at')
    .eq('company_id', COMPANY_ID)
    .eq('event_type', 'X-FLOSMOSIS-SPEC_VERSION_ANOMALY')
    .limit(1)
    .maybeSingle();

  if (priorAnnotation) {
    console.log('Annotation already minted for this company:');
    console.log(`  id:         ${(priorAnnotation as any).id}`);
    console.log(`  event_hash: ${(priorAnnotation as any).event_hash}`);
    console.log(`  created_at: ${(priorAnnotation as any).created_at}`);
    console.log('Refusing to mint again. Append-only.');
    process.exit(0);
  }

  // Sanity check: the two anomaly rows should still be present in the
  // substrate with their original hashes. If they are not, abort.
  const { data: anomalyRows } = await supabase
    .from('shift_events')
    .select('id, event_hash, spec_version, created_at')
    .in('id', AFFECTED.map((r) => r.id));
  if (!anomalyRows || anomalyRows.length !== AFFECTED.length) {
    console.error(
      `Expected ${AFFECTED.length} anomaly rows, found ${anomalyRows?.length ?? 0}. Aborting.`,
    );
    process.exit(1);
  }
  for (const expected of AFFECTED) {
    const live = anomalyRows.find((r: any) => r.id === expected.id);
    if (!live || live.event_hash !== expected.hash || live.spec_version !== '0') {
      console.error(
        `Anomaly row ${expected.id} drift: expected hash ${expected.hash} / spec '0', `
        + `got hash ${live?.event_hash} / spec ${live?.spec_version}. Aborting.`,
      );
      process.exit(1);
    }
  }
  console.log('Anomaly rows confirmed intact and unmutated.');

  // Get current v1 chain tail. With M1 live and the bridge already in
  // place this returns ec801f17… until a real v1 event has landed.
  const v1Tail = await getV1ChainTail(supabase as any, COMPANY_ID);
  console.log(`v1 chain tail at mint:    ${v1Tail}`);

  const now = new Date();
  const unsealed = buildSpecVersionAnomaly({
    actorId: FLOSMOSIS_SYSTEM_ACTOR_ID,
    subjectId: COMPANY_ID,
    timestamp: now.toISOString(),
    previousEventHash: v1Tail,
    defect: 'SPEC_STAMP_MISCLASSIFICATION_2026_06_05',
    rootCauseSummary:
      'Two routes wrote spec_version=0 events after the 2026-06-04T02:56:50Z '
      + 'WLES cutover. Defect A: /api/command/shifts/[shiftId]/approve had no v1 '
      + 'branch — PAYROLL_APPROVAL d6249c3a stamped 0 even with WLES_V1_ENABLED=true. '
      + 'Defect B: /api/command/export had a v1 branch but silently fell through to '
      + 'v0 when (flag, company_id) was falsy — EXPORT_RECORD e22ee9fd resulted. '
      + 'Both defects remediated in M1: every route now seals under v1.0, fails '
      + 'closed when WLES_V1_ENABLED is missing, and asserts company_id is present '
      + 'before sealing. M0 substrate constraint shift_events_post_cutover_spec_v1 '
      + 'NOT VALID makes any future post-cutover v0 insert impossible.',
    remediationPr: 'phase1/export-verification-spine HEAD (M0+M1 coordinated deploy)',
    affectedEventIds: AFFECTED.map((r) => r.id),
    affectedEventHashes: AFFECTED.map((r) => r.hash),
    originalSpecVersion: '0',
    intendedSpecVersion: '1.0',
  });
  const sealed = sealEvent(unsealed);

  console.log('Sealed annotation:');
  console.log(`  event_id:            ${sealed.event_id}`);
  console.log(`  event_type:          ${sealed.event_type}`);
  console.log(`  event_hash:          ${sealed.event_hash}`);
  console.log(`  previous_event_hash: ${sealed.previous_event_hash}`);

  await insertV1Event(supabase as any, sealed, {
    companyId: COMPANY_ID,
    workerId: null,
    siteId: null,
    createdBy: 'system:m2-spec-anomaly-annotation',
  });

  // Post-mint verification.
  const { count } = await supabase
    .from('shift_events')
    .select('id', { count: 'exact', head: true });
  console.log(`shift_events total after mint: ${count ?? 'unknown'}`);
  console.log('M2 done.');
}

main().catch((err) => {
  console.error('M2 emission failed:', err);
  process.exit(1);
});
