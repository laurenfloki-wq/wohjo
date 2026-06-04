// FLOSTRUCTION WLES v1 activation — production bridge emitter.
//
// Run AFTER `WLES_V1_ENABLED=true` is set in Vercel production and the
// new deploy is healthy. Calls the validated `getV1ChainTail` path with
// the service-role Supabase client, which in turn calls
// `createBridgeEvent` -> `buildSpecVersionMigration` -> `sealEvent` and
// inserts a single `X-FLOSMOSIS-SPEC_VERSION_MIGRATION` event anchored
// to the company's current V0 tail.
//
// Idempotent: if a v1.0 event already exists for the company, returns
// the existing chain tail without minting a new bridge.
//
// Forward-only: V0 is never touched. The V0-scoped immutability
// fingerprint must remain unchanged across this run.

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();
import { createClient } from '@supabase/supabase-js';
import { getV1ChainTail } from '../src/lib/wles/v1-chain';

const COMPANY_ID =
  process.env.WLES_BOOTSTRAP_COMPANY_ID ?? '00000000-1000-0000-0000-000000000001';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const before = await supabase
    .from('shift_events')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', COMPANY_ID)
    .eq('spec_version', '1.0');

  console.log(`v1 events for ${COMPANY_ID} BEFORE: ${before.count ?? 0}`);

  const tail = await getV1ChainTail(supabase as any, COMPANY_ID);
  console.log(`v1 chain tail hash: ${tail}`);

  const after = await supabase
    .from('shift_events')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', COMPANY_ID)
    .eq('spec_version', '1.0');

  console.log(`v1 events for ${COMPANY_ID} AFTER:  ${after.count ?? 0}`);
}

main().catch((err) => {
  console.error('Bridge emission failed:', err);
  process.exit(1);
});
