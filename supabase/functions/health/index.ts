// /health Edge Function (Deno) — the uptime monitor's target.
//
// Kept self-contained and Deno-native (it cannot import the Node platform/db
// module, which uses postgres.js). It performs a cheap liveness + DB reachability
// check via the Supabase REST endpoint using the service role key.
//
// Excluded from the root tsc (Deno URL imports); validated by `supabase functions
// deploy` and the deployed runtime.

// @ts-nocheck — Deno runtime; types resolved by the Supabase Edge runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async () => {
  const checks: Record<string, 'ok' | 'fail'> = {};
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    // Cheap reachability: read one row from the kill-switch config.
    const { error } = await supabase.from('bot_config').select('bot_id').limit(1);
    checks.db = error ? 'fail' : 'ok';
  } catch {
    checks.db = 'fail';
  }

  const ok = Object.values(checks).every((v) => v === 'ok');
  return new Response(JSON.stringify({ ok, checks, ts: new Date().toISOString() }), {
    status: ok ? 200 : 503,
    headers: { 'content-type': 'application/json' },
  });
});
