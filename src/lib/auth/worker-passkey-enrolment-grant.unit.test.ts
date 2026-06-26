// W2(2) ship — mintPhoneOtpEnrolmentGrant: a phone-OTP sign-in mints the
// SMS-sourced grant that authorises passkey enrolment. Flag-gated + SMS-sourced
// (challenge_id set, webauthn_challenge_id absent) so it never self-perpetuates.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const challengeInsert = vi.fn((_row: Record<string, unknown>) => ({
  select: () => ({ single: async () => ({ data: { id: 'chal-1' }, error: null }) }),
}));
const grantInsert = vi.fn(async (_row: Record<string, unknown>) => ({ error: null }));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (t: string) => {
      if (t === 'worker_mfa_challenges') return { insert: challengeInsert };
      if (t === 'worker_mfa_grants') return { insert: grantInsert };
      return {};
    },
  }),
}));

import { mintPhoneOtpEnrolmentGrant } from './worker-passkey';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WORKER_PASSKEY_ACCESS = 'true';
});
afterEach(() => {
  delete process.env.WORKER_PASSKEY_ACCESS;
});

describe('mintPhoneOtpEnrolmentGrant', () => {
  it('is inert when the flag is off (no DB writes)', async () => {
    process.env.WORKER_PASSKEY_ACCESS = 'false';
    await mintPhoneOtpEnrolmentGrant('worker-1', 'ua-bind');
    expect(challengeInsert).not.toHaveBeenCalled();
    expect(grantInsert).not.toHaveBeenCalled();
  });

  it('records a consumed APP_ACCESS challenge + an SMS-sourced grant', async () => {
    await mintPhoneOtpEnrolmentGrant('worker-1', 'ua-bind');

    const chalArg = challengeInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(chalArg.worker_id).toBe('worker-1');
    expect(chalArg.challenge_for).toBe('APP_ACCESS');
    expect(chalArg.consumed_at).toBeTruthy(); // the phone-OTP is already verified

    const grantArg = grantInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(grantArg.worker_id).toBe('worker-1');
    expect(grantArg.challenge_for).toBe('APP_ACCESS');
    expect(grantArg.challenge_id).toBe('chal-1'); // SMS-sourced
    expect(grantArg.webauthn_challenge_id).toBeUndefined(); // NOT passkey-sourced
    expect(grantArg.device_binding).toBe('ua-bind');
    expect(grantArg.consumed_at).toBeUndefined(); // grant is live (unconsumed)
  });
});
