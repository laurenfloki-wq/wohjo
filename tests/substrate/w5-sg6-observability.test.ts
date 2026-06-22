// W5 / SG-6 — observability pins (2026-06-11).
//
// Sentry was cancelled by Council decision (CRACK 172/179 — no AU
// region; APP 8 forbids routing PII through EU/US infrastructure).
// The PII-scrubbed Slack shim IS the sanctioned pipeline; these pins
// hold its coverage together.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8');
const SLACK = read('src/lib/observability/slack.ts');
const HEALTH = read('src/app/api/cron/substrate-health/route.ts');
const VERIFY = read('src/app/api/cron/verify-hashes/route.ts');
const RUNBOOK = read('docs/incident-runbook.md');

describe('W5.1 — the sanctioned alert pipeline', () => {
  it('postOpsAlert exists, redacts, throttles, and times out like reportError', () => {
    expect(SLACK).toMatch(/export async function postOpsAlert/);
    expect(SLACK).toMatch(/postOpsAlert[\s\S]*?safeMessage\(/);
    expect(SLACK).toMatch(/postOpsAlert[\s\S]*?shouldFire/);
    expect(SLACK).toMatch(/postOpsAlert[\s\S]*?FETCH_TIMEOUT_MS/);
  });

  it('REDs ping a human: substrate-health and verify-hashes both wire dispatchOpsAlert', () => {
    // Phase 3: the crons fan out via dispatchOpsAlert (email + SMS + Slack),
    // not the Slack-only postOpsAlert, so no single channel outage silences them.
    expect(HEALTH).toMatch(/dispatchOpsAlert\(/);
    expect(VERIFY).toMatch(/dispatchOpsAlert\(/);
    // Durable record first, ping second (best-effort void).
    expect(VERIFY.indexOf('writeAlertRows(')).toBeLessThan(VERIFY.indexOf('dispatchOpsAlert('));
  });
});

describe('W5.2 — FLOS-SHA-001 coverage', () => {
  it('the runner records all four wired checks', () => {
    for (const name of [
      'anchor_fingerprint',
      'webhook_delivery_twilio',
      'webhook_delivery_stripe',
      'cron_health',
    ]) {
      expect(HEALTH).toContain(`check_name: '${name}'`);
    }
  });

  it('cron_health watches the chain alarm freshness (26h)', () => {
    expect(HEALTH).toMatch(/chain_integrity_shift_events/);
    expect(HEALTH).toMatch(/26 \* 60 \* 60 \* 1000/);
  });
});

describe('W5.3 — the runbook covers every alarm that can fire', () => {
  it('one section per wired check, plus the 500 shim and escalation', () => {
    for (const s of [
      'anchor_fingerprint',
      'chain_integrity_shift_events',
      'webhook_delivery_twilio',
      'webhook_delivery_stripe',
      'cron_health',
      'x-vercel-id',
      'Escalation',
    ]) {
      expect(RUNBOOK).toContain(s);
    }
  });

  it('alerts point at the runbook', () => {
    expect(HEALTH).toMatch(/incident-runbook/);
    expect(VERIFY).toMatch(/incident-runbook/);
  });
});

describe('W5.4 — chokepoint sweep: no route builds its own supabase-js client', () => {
  it('stripe webhook, auth hook, and onboarding status use the system accessor', () => {
    for (const f of [
      'src/app/api/stripe/webhook/route.ts',
      'src/app/api/auth/events/hook/route.ts',
      'src/app/api/onboarding/status/route.ts',
    ]) {
      const s = read(f);
      expect(s, f).toMatch(/getServiceClientForSystemJob\(\)/);
      expect(s, f).not.toMatch(/from ['"]@supabase\/supabase-js['"]/);
    }
  });
});
