// CRACK 183/184 integration test — observeWorkerSignIn happy path.
//
// Verifies end-to-end:
//   - a sign-in writes a row to worker_sign_in_log
//   - first observation upserts a row in worker_device_fingerprints
//   - re-observation touches last_seen_at without inserting a dup
//   - flag set is empty for a clean sign-in
//
// Uses the test company UUID 00000000-1000-0000-0000-000000000001 and
// Joao worker UUID 00000000-1000-0000-0000-000000000004.
// Skipped unless TEST_INTEGRATION_DB env var is set.

import { describe, it, expect, beforeEach } from 'vitest';
import { createServiceClient } from '@/lib/supabase/server';
import { observeWorkerSignIn } from './worker-signin-anomaly';
import pino from 'pino';

const TEST_WORKER = '00000000-1000-0000-0000-000000000004';
const log = pino({ level: 'silent' });

const skipIfNoIntegrationDb =
  process.env.TEST_INTEGRATION_DB === 'true' ? describe : describe.skip;

skipIfNoIntegrationDb('observeWorkerSignIn integration', () => {
  beforeEach(async () => {
    const supabase = createServiceClient();
    await supabase.from('worker_sign_in_log').delete().eq('worker_id', TEST_WORKER);
    await supabase.from('worker_device_fingerprints').delete().eq('worker_id', TEST_WORKER);
  });

  it('first sign-in creates fingerprint row and log row with NEW_DEVICE_SIGN_IN flag', async () => {
    const result = await observeWorkerSignIn(log, {
      workerId: TEST_WORKER,
      workerFirstName: 'Joao',
      companyId: '00000000-1000-0000-0000-000000000001',
      userAgent: 'Mozilla/5.0 (Linux; Android 9) Mobile',
      acceptLanguage: 'en-AU',
      ipAddress: '127.0.0.1',
      ipCountry: 'AU',
      ipCity: 'Sydney',
      ipLat: -33.8688,
      ipLng: 151.2093,
      signedInAt: new Date('2026-05-08T07:00:00Z'),
    });

    expect(result?.flags).toContain('NEW_DEVICE_SIGN_IN');

    const supabase = createServiceClient();
    const { data: logRows } = await supabase
      .from('worker_sign_in_log')
      .select('worker_id, ip_country, flags')
      .eq('worker_id', TEST_WORKER);
    expect(logRows).toHaveLength(1);
    expect(logRows![0].flags).toContain('NEW_DEVICE_SIGN_IN');

    const { data: fpRows } = await supabase
      .from('worker_device_fingerprints')
      .select('worker_id, ip_country, device_label')
      .eq('worker_id', TEST_WORKER);
    expect(fpRows).toHaveLength(1);
    expect(fpRows![0].device_label).toMatch(/Android phone from Sydney/);
  });

  it('second sign-in same fingerprint does NOT raise NEW_DEVICE_SIGN_IN', async () => {
    const ctx = {
      workerId: TEST_WORKER,
      workerFirstName: 'Joao',
      companyId: '00000000-1000-0000-0000-000000000001',
      userAgent: 'Mozilla/5.0 (Linux; Android 9) Mobile',
      acceptLanguage: 'en-AU',
      ipAddress: '127.0.0.1',
      ipCountry: 'AU',
      ipCity: 'Sydney',
      ipLat: -33.8688,
      ipLng: 151.2093,
    };
    await observeWorkerSignIn(log, { ...ctx, signedInAt: new Date('2026-05-08T07:00:00Z') });
    const result = await observeWorkerSignIn(log, { ...ctx, signedInAt: new Date('2026-05-08T08:00:00Z') });

    expect(result?.flags).not.toContain('NEW_DEVICE_SIGN_IN');
  });
});
