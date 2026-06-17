// Saturday Shape A — Task A4: tests for /setting-up page + status endpoint.
//
// Source-string assertion battery pinning canonical mockup language
// + status-state structure + polling/timeout configuration.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const PAGE = fs.readFileSync(path.join(process.cwd(), 'src/app/setting-up/page.tsx'), 'utf-8');
const STATUS_ROUTE = fs.readFileSync(
  path.join(process.cwd(), 'src/app/api/onboarding/status/route.ts'),
  'utf-8',
);

describe('/setting-up page — substrate-DD shape', () => {
  it('is a client component (uses useEffect + useRouter + useSearchParams)', () => {
    expect(PAGE).toMatch(/^'use client'/m);
    expect(PAGE).toMatch(/import\s*\{[^}]*useEffect[^}]*\}\s*from\s*'react'/);
    expect(PAGE).toMatch(/useRouter/);
    expect(PAGE).toMatch(/useSearchParams/);
  });

  it('reads session_id from search params', () => {
    expect(PAGE).toMatch(/searchParams\?\.get\('session_id'\)/);
  });

  it('polls /api/onboarding/status with the session_id', () => {
    expect(PAGE).toMatch(
      /\/api\/onboarding\/status\?session_id=\$\{encodeURIComponent\(sessionId\)\}/,
    );
  });

  it('uses 5-second poll interval', () => {
    expect(PAGE).toMatch(/POLL_INTERVAL_MS\s*=\s*5_000/);
  });

  it('uses 60-second hold timeout', () => {
    expect(PAGE).toMatch(/HOLD_TIMEOUT_MS\s*=\s*60_000/);
  });

  it('redirects to /today on ready status', () => {
    expect(PAGE).toMatch(/router\.push\('\/today'\)/);
  });

  it('renders distinct UI for each status state', () => {
    expect(PAGE).toMatch(/data-testid="setting-up-ready"/);
    expect(PAGE).toMatch(/data-testid="setting-up-failed"/);
    expect(PAGE).toMatch(/data-testid="setting-up-timeout"/);
    expect(PAGE).toMatch(/data-testid="setting-up-no-session"/);
  });

  it('hold-timeout copy includes Friday-founder-decision draft language', () => {
    // Per Friday brief: "We're still processing your payment — your
    // tenant will be ready in a few minutes. If this persists, reply
    // to this email and we'll sort it manually." Lauren reviews +
    // finalises Sunday.
    expect(PAGE).toMatch(/still processing your payment/);
    expect(PAGE).toMatch(/sort it manually/);
  });

  it('uses canonical mockup palette tokens', () => {
    expect(PAGE).toMatch(/#0F0F10/); // charcoal
    expect(PAGE).toMatch(/#F5F2EA/); // cream
    expect(PAGE).toMatch(/#D9A548/); // mockup amber
    expect(PAGE).toMatch(/#1A1A1C/); // charcoal-800
  });

  it('uses Archivo Narrow display + JetBrains Mono numerical', () => {
    expect(PAGE).toMatch(/Archivo Narrow/);
    expect(PAGE).toMatch(/JetBrains Mono/);
  });

  it('cream@55% rgba for muted body text (AAA-pass)', () => {
    expect(PAGE).toMatch(/rgba\(245,242,234,0\.55\)/);
  });

  it('Retry CTA reloads window on timeout state', () => {
    expect(PAGE).toMatch(/window\.location\.reload\(\)/);
    expect(PAGE).toMatch(/data-testid="setting-up-retry"/);
  });

  it('failure path provides direct mailto with prefilled subject', () => {
    expect(PAGE).toMatch(/mailto:standards@flosmosis\.com\?subject=Provisioning%20issue/);
  });
});

describe('/api/onboarding/status route — substrate-DD shape', () => {
  it('declares GET handler', () => {
    expect(STATUS_ROUTE).toMatch(/export async function GET\(/);
  });

  it('rate-limits 60 requests per minute (poll-friendly)', () => {
    expect(STATUS_ROUTE).toMatch(
      /checkRateLimit\(`onboarding\.status:\$\{ip\}`,\s*\{[\s\S]*?maxRequests:\s*60[\s\S]*?windowMs:\s*60_000/,
    );
  });

  it('requires session_id query param', () => {
    expect(STATUS_ROUTE).toMatch(/searchParams\.get\('session_id'\)/);
    expect(STATUS_ROUTE).toMatch(/session_id required/);
  });

  it('queries stripe_event_log for checkout.session.completed events', () => {
    expect(STATUS_ROUTE).toMatch(/\.from\('stripe_event_log'\)/);
    expect(STATUS_ROUTE).toMatch(/\.eq\('event_type',\s*'checkout\.session\.completed'\)/);
  });

  it('filters by payload_summary->session_id matching the requested session', () => {
    expect(STATUS_ROUTE).toMatch(/\.filter\('payload_summary->session_id',\s*'eq',\s*sessionId\)/);
  });

  it('returns pending when event row not yet present', () => {
    expect(STATUS_ROUTE).toMatch(/!events \|\| events\.length === 0[\s\S]*?status:\s*'pending'/);
  });

  it('returns pending when event present but processed_at IS NULL', () => {
    expect(STATUS_ROUTE).toMatch(/event\.processed_at === null[\s\S]*?status:\s*'pending'/);
  });

  it('returns ready with company_id when companies row exists', () => {
    expect(STATUS_ROUTE).toMatch(/status:\s*'ready'[\s\S]*?company_id:\s*company\.id/);
  });

  it('returns failed when company row missing post-processing (refund-required)', () => {
    expect(STATUS_ROUTE).toMatch(/status:\s*'failed'[\s\S]*?Provisioning failed/);
  });

  it('looks up companies by stripe_customer_id from the event payload', () => {
    expect(STATUS_ROUTE).toMatch(
      /\.from\('companies'\)[\s\S]*?\.eq\('stripe_customer_id',\s*customerId\)/,
    );
  });
});
