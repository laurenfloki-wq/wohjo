import { describe, it, expect, vi, beforeEach } from 'vitest';

const { slackMock, emailMock, smsMock } = vi.hoisted(() => ({
  slackMock: vi.fn(() => Promise.resolve()),
  emailMock: vi.fn(() => Promise.resolve()),
  smsMock: vi.fn(() => Promise.resolve()),
}));
vi.mock('./slack', () => ({ postOpsAlert: slackMock }));
vi.mock('@/lib/email/notify', () => ({ sendOpsAlertEmail: emailMock }));
vi.mock('@/lib/sms/ops-sms', () => ({ sendOpsAlertSms: smsMock }));
vi.mock('@/lib/logger', () => ({
  routeLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { dispatchOpsAlert } from './ops-alert';

beforeEach(() => vi.clearAllMocks());

describe('dispatchOpsAlert (Phase 3 / OBS-2)', () => {
  it('always sends email + slack; no SMS by default', async () => {
    await dispatchOpsAlert('title', ['line1']);
    expect(emailMock).toHaveBeenCalledTimes(1);
    expect(slackMock).toHaveBeenCalledTimes(1);
    expect(smsMock).not.toHaveBeenCalled();
  });

  it('adds the out-of-band SMS when sms:true', async () => {
    await dispatchOpsAlert('title', ['line1'], { sms: true });
    expect(smsMock).toHaveBeenCalledTimes(1);
  });

  it('isolates channels — one failing never blocks the others or throws', async () => {
    // Email down is the exact case SMS must still cover.
    emailMock.mockRejectedValueOnce(new Error('resend down'));
    await expect(dispatchOpsAlert('title', ['line1'], { sms: true })).resolves.toBeUndefined();
    expect(slackMock).toHaveBeenCalledTimes(1);
    expect(smsMock).toHaveBeenCalledTimes(1);
  });
});
