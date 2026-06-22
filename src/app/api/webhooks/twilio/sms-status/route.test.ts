import { describe, it, expect, vi, beforeEach } from 'vitest';

const { validateMock, deadLetterMock } = vi.hoisted(() => ({
  validateMock: vi.fn(),
  deadLetterMock: vi.fn(),
}));
vi.mock('@/lib/twilio/client', () => ({ validateTwilioSignature: validateMock }));
vi.mock('@/lib/notify/dead-letter', () => ({ recordNotificationDeadLetter: deadLetterMock }));
vi.mock('@/lib/logger', () => ({
  routeLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { POST } from './route';

function req(params: Record<string, string>): Request {
  return new Request('http://test/api/webhooks/twilio/sms-status', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': 'sig',
    },
    body: new URLSearchParams(params).toString(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  deadLetterMock.mockResolvedValue(undefined);
});

describe('sms-status webhook (NOTIF-3)', () => {
  it('rejects a bad signature with 403 and records nothing', async () => {
    validateMock.mockReturnValue(false);
    const res = await POST(req({ MessageStatus: 'failed', MessageSid: 'SM1', To: '+61400000000' }));
    expect(res.status).toBe(403);
    expect(deadLetterMock).not.toHaveBeenCalled();
  });

  it('dead-letters an undelivered/failed delivery', async () => {
    validateMock.mockReturnValue(true);
    const res = await POST(
      req({ MessageStatus: 'failed', MessageSid: 'SM1', To: '+61400000000', ErrorCode: '30003' }),
    );
    expect(res.status).toBe(200);
    expect(deadLetterMock).toHaveBeenCalledTimes(1);
    const arg = deadLetterMock.mock.calls[0][0] as {
      channel: string;
      recipient: string;
      error: string;
    };
    expect(arg.channel).toBe('twilio_sms');
    expect(arg.recipient).toBe('+61400000000');
    expect(arg.error).toMatch(/failed.*30003/);
  });

  it('records nothing for a successful (delivered) status', async () => {
    validateMock.mockReturnValue(true);
    const res = await POST(
      req({ MessageStatus: 'delivered', MessageSid: 'SM1', To: '+61400000000' }),
    );
    expect(res.status).toBe(200);
    expect(deadLetterMock).not.toHaveBeenCalled();
  });
});
