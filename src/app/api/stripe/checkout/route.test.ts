// Saturday Shape A — Task A3 tests for /api/stripe/checkout.
//
// Focus: client_reference_id signing/verification round-trip, payload
// validation, and the substrate-DD invariants the webhook handler
// relies on.
//
// Cowork cannot exercise the live Stripe API from the test runner
// (no test credentials present), so the createCheckoutSession path
// is exercised by source-string assertion (form fields, headers).

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { verifyClientReference } from './route';

const ROUTE_SOURCE = fs.readFileSync(
  path.join(process.cwd(), 'src/app/api/stripe/checkout/route.ts'),
  'utf-8',
);

beforeAll(() => {
  process.env.STRIPE_CLIENT_REF_SECRET = 'test-secret-32-chars-aaaaaaaaaaaa';
});

describe('client_reference_id signing — verifyClientReference round-trip', () => {
  // Mirror the signing logic to sign tokens for test verification.
  // (signClientReference is internal; tests sign via the same HMAC
  // contract documented in the route.)
  function makeToken(claims: Record<string, unknown>): string {
    const { createHmac } = require('node:crypto');
    const payload = Buffer.from(JSON.stringify(claims), 'utf-8').toString('base64url');
    const hmac = createHmac('sha256', process.env.STRIPE_CLIENT_REF_SECRET).update(payload).digest('base64url');
    return `${payload}.${hmac}`;
  }

  it('verifies a valid token and returns its claims', () => {
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      uid: '11111111-1111-4111-8111-111111111111',
      meta: { email: 'a@example.test', company_name: 'Acme', abn_digits: '53004085616' },
      iat: now,
      exp: now + 600,
    };
    const token = makeToken(claims);
    const result = verifyClientReference(token);
    expect(result).not.toBeNull();
    expect(result?.uid).toBe(claims.uid);
    expect(result?.meta.email).toBe('a@example.test');
  });

  it('rejects a token with a tampered payload', () => {
    const now = Math.floor(Date.now() / 1000);
    const claims = { uid: 'u', meta: { email: 'a', company_name: 'b', abn_digits: 'c' }, iat: now, exp: now + 600 };
    const token = makeToken(claims);
    const [, sig] = token.split('.');
    // Tamper: swap the payload portion for a different one
    const tamperedClaims = { ...claims, uid: 'attacker' };
    const tamperedPayload = Buffer.from(JSON.stringify(tamperedClaims), 'utf-8').toString('base64url');
    const result = verifyClientReference(`${tamperedPayload}.${sig}`);
    expect(result).toBeNull();
  });

  it('rejects a token with a tampered signature', () => {
    const now = Math.floor(Date.now() / 1000);
    const claims = { uid: 'u', meta: { email: 'a', company_name: 'b', abn_digits: 'c' }, iat: now, exp: now + 600 };
    const token = makeToken(claims);
    const [payload] = token.split('.');
    const result = verifyClientReference(`${payload}.AAAA`);
    expect(result).toBeNull();
  });

  it('rejects an expired token', () => {
    const now = Math.floor(Date.now() / 1000);
    const expired = {
      uid: 'u',
      meta: { email: 'a', company_name: 'b', abn_digits: 'c' },
      iat: now - 3600,
      exp: now - 60,
    };
    const token = makeToken(expired);
    expect(verifyClientReference(token)).toBeNull();
  });

  it('rejects a malformed token (no dot separator)', () => {
    expect(verifyClientReference('not-a-valid-token')).toBeNull();
  });

  it('rejects an empty token', () => {
    expect(verifyClientReference('')).toBeNull();
  });
});

describe('/api/stripe/checkout route — substrate-DD shape', () => {
  it('declares POST handler', () => {
    expect(ROUTE_SOURCE).toMatch(/export async function POST\(/);
  });

  it('declares runtime = nodejs (uses node:crypto for HMAC)', () => {
    expect(ROUTE_SOURCE).toMatch(/export const runtime = 'nodejs'/);
  });

  it('validates pricing_tier against canonical TIERS enum', () => {
    expect(ROUTE_SOURCE).toMatch(
      /pricing_tier:\s*z\.enum\(\['founding',\s*'standard',\s*'growth',\s*'scale',\s*'enterprise'\]\)/,
    );
  });

  it('validates billing_cadence against monthly|yearly', () => {
    expect(ROUTE_SOURCE).toMatch(/billing_cadence:\s*z\.enum\(\['monthly',\s*'yearly'\]\)/);
  });

  it('validates abn_digits as 11-digit string (per companies.abn_digits CHECK)', () => {
    expect(ROUTE_SOURCE).toMatch(/abn_digits:\s*z\.string\(\)\.regex\(\/\^\[0-9\]\{11\}\$\//);
  });

  it('validates admin_user_id as a UUID (foreign key to auth.users)', () => {
    expect(ROUTE_SOURCE).toMatch(/admin_user_id:\s*z\.string\(\)\.uuid/);
  });

  it('rate-limits 5 per IP per hour', () => {
    expect(ROUTE_SOURCE).toMatch(
      /checkRateLimit\(`stripe\.checkout:\$\{ip\}`,\s*\{[\s\S]*?maxRequests:\s*5/,
    );
  });

  it('uses Stripe API base https://api.stripe.com/v1/checkout/sessions', () => {
    expect(ROUTE_SOURCE).toMatch(
      /https:\/\/api\.stripe\.com\/v1\/checkout\/sessions/,
    );
  });

  it('passes lookup_keys[] and metadata[*] in the form payload', () => {
    expect(ROUTE_SOURCE).toMatch(/lookup_keys\[\]/);
    expect(ROUTE_SOURCE).toMatch(/metadata\[\$\{k\}\]/);
  });

  it('embeds pricing_tier + billing_cadence + signup_idempotency in metadata', () => {
    expect(ROUTE_SOURCE).toMatch(/pricing_tier,\s*\n\s*billing_cadence,\s*\n\s*signup_idempotency/);
  });

  it('success_url uses the canonical /setting-up surface with session_id macro', () => {
    expect(ROUTE_SOURCE).toMatch(
      /\/setting-up\?session_id=\{CHECKOUT_SESSION_ID\}/,
    );
  });

  it('cancel_url returns the user to /get-started?cancelled=1', () => {
    expect(ROUTE_SOURCE).toMatch(/\/get-started\?cancelled=1/);
  });
});
