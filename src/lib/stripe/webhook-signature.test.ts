import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyStripeSignature } from './webhook-signature';

const SECRET = 'whsec_testtesttest';

function signed(t: number, body: string, secret = SECRET): string {
  const sig = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${sig}`;
}

describe('verifyStripeSignature', () => {
  const body = '{"id":"evt_test","type":"customer.subscription.created"}';

  it('accepts a fresh signed payload', () => {
    const t = Math.floor(Date.now() / 1000);
    const r = verifyStripeSignature({ payload: body, header: signed(t, body), secret: SECRET });
    expect(r.ok).toBe(true);
  });

  it('rejects when the secret does not match', () => {
    const t = Math.floor(Date.now() / 1000);
    const r = verifyStripeSignature({
      payload: body, header: signed(t, body, 'whsec_OTHER'), secret: SECRET,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('signature_mismatch');
  });

  it('rejects when the body has been tampered with', () => {
    const t = Math.floor(Date.now() / 1000);
    const r = verifyStripeSignature({
      payload: body + 'tampered', header: signed(t, body), secret: SECRET,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('signature_mismatch');
  });

  it('rejects when the timestamp is too old (replay)', () => {
    const t = Math.floor(Date.now() / 1000) - 600; // 10 min old
    const r = verifyStripeSignature({
      payload: body, header: signed(t, body), secret: SECRET,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('timestamp_outside_tolerance');
  });

  it('rejects when the timestamp is too far in the future', () => {
    const t = Math.floor(Date.now() / 1000) + 600;
    const r = verifyStripeSignature({
      payload: body, header: signed(t, body), secret: SECRET,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('timestamp_outside_tolerance');
  });

  it('rejects when the header is missing', () => {
    expect(verifyStripeSignature({ payload: body, header: '', secret: SECRET }))
      .toEqual({ ok: false, reason: 'header_missing' });
  });

  it('rejects when the header is malformed', () => {
    expect(verifyStripeSignature({ payload: body, header: 'garbage', secret: SECRET }))
      .toEqual({ ok: false, reason: 'header_malformed' });
  });

  it('rejects when the secret is missing', () => {
    const t = Math.floor(Date.now() / 1000);
    expect(verifyStripeSignature({ payload: body, header: signed(t, body), secret: '' }))
      .toEqual({ ok: false, reason: 'secret_missing' });
  });

  it('accepts when one of multiple v1 signatures matches (key rotation window)', () => {
    const t = Math.floor(Date.now() / 1000);
    const validSig = createHmac('sha256', SECRET).update(`${t}.${body}`).digest('hex');
    const header = `t=${t},v1=fakeoldsignature1234567890,v1=${validSig}`;
    expect(verifyStripeSignature({ payload: body, header, secret: SECRET }).ok).toBe(true);
  });
});
