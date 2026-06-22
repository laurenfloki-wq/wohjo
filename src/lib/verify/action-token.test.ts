import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mintActionToken, verifyActionToken, actionTokenRequired } from './action-token';

const SUP = 'sup-123';
const NOW = 1_750_000_000_000; // fixed ms

describe('action-token', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret';
    delete process.env.VERIFY_REQUIRE_ACTION_TOKEN;
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.VERIFY_REQUIRE_ACTION_TOKEN;
  });

  it('mints a token that verifies for its subject within the window', () => {
    const tok = mintActionToken(SUP, NOW);
    expect(tok).not.toBeNull();
    expect(verifyActionToken(tok, SUP, NOW)).toBe('valid');
  });

  it('rejects a token for a different supervisor', () => {
    const tok = mintActionToken(SUP, NOW);
    expect(verifyActionToken(tok, 'someone-else', NOW)).toBe('wrong_subject');
  });

  it('expires after 30 minutes', () => {
    const tok = mintActionToken(SUP, NOW);
    expect(verifyActionToken(tok, SUP, NOW + 31 * 60 * 1000)).toBe('expired');
    expect(verifyActionToken(tok, SUP, NOW + 29 * 60 * 1000)).toBe('valid');
  });

  it('rejects a tampered signature', () => {
    const tok = mintActionToken(SUP, NOW)!;
    const tampered = tok.slice(0, -2) + (tok.endsWith('aa') ? 'bb' : 'aa');
    expect(verifyActionToken(tampered, SUP, NOW)).toBe('bad_signature');
  });

  it('rejects missing / malformed tokens', () => {
    expect(verifyActionToken(null, SUP, NOW)).toBe('missing');
    expect(verifyActionToken('', SUP, NOW)).toBe('missing');
    expect(verifyActionToken('a.b', SUP, NOW)).toBe('malformed');
  });

  it('is inert (no signing key) when no secret is set', () => {
    delete process.env.CRON_SECRET;
    delete process.env.TWILIO_AUTH_TOKEN;
    expect(mintActionToken(SUP, NOW)).toBeNull();
    expect(verifyActionToken('anything.123.sig', SUP, NOW)).toBe('missing');
  });

  it('enforcement: off in non-prod, ON in production by default, env override wins (AUTH-1)', () => {
    const savedVercelEnv = process.env.VERCEL_ENV;
    try {
      delete process.env.VERCEL_ENV;
      expect(actionTokenRequired()).toBe(false); // unset flag, non-prod → off

      process.env.VERCEL_ENV = 'production';
      expect(actionTokenRequired()).toBe(true); // AUTH-1 — production defaults ON

      process.env.VERIFY_REQUIRE_ACTION_TOKEN = 'false';
      expect(actionTokenRequired()).toBe(false); // explicit kill-switch wins, even in prod

      process.env.VERIFY_REQUIRE_ACTION_TOKEN = 'true';
      delete process.env.VERCEL_ENV;
      expect(actionTokenRequired()).toBe(true); // explicit on wins, even non-prod
    } finally {
      if (savedVercelEnv === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = savedVercelEnv;
    }
  });
});
