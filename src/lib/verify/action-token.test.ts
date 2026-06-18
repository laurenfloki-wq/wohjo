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

  it('enforcement defaults off', () => {
    expect(actionTokenRequired()).toBe(false);
    process.env.VERIFY_REQUIRE_ACTION_TOKEN = 'true';
    expect(actionTokenRequired()).toBe(true);
  });
});
