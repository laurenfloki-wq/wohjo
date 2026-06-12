// B4 / SG-5 — outbound notification dead-letter pins (2026-06-12).
//
// Inbound (Twilio, Stripe) got Stripe-bar dead-letter semantics in
// W4/W5. This locks the outbound side: every failed worker SMS and
// Resend email leaves a durable, operator-replayable record, and the
// substrate-health cron surfaces unreplayed rows RED. No message
// bodies and no OTP codes are ever persisted.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8');
const MIGRATION = read('migrations/20260612061000_b4_notification_dead_letter.sql');
const LIB = read('src/lib/notify/dead-letter.ts');
const SMS_NOTIFY = read('src/lib/sms/worker-notify.ts');
const EMAIL_NOTIFY = read('src/lib/email/notify.ts');
const WELCOME = read('src/lib/email/welcome.ts');
const HEALTH = read('src/app/api/cron/substrate-health/route.ts');

describe('B4.1 — dead-letter table substrate', () => {
  it('migration creates the table with RLS enabled and grants revoked', () => {
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS public\.notification_dead_letter/);
    expect(MIGRATION).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(MIGRATION).toMatch(/REVOKE ALL ON public\.notification_dead_letter FROM PUBLIC, anon, authenticated/);
    expect(MIGRATION).toMatch(/CHECK \(channel IN \('twilio_sms', 'resend_email'\)\)/);
  });

  it('unreplayed scan path is indexed (health-check query)', () => {
    expect(MIGRATION).toMatch(/idx_notification_dead_letter_unreplayed/);
    expect(MIGRATION).toMatch(/WHERE replayed_at IS NULL/);
  });

  it('recorder reaches the DB via the service-client chokepoint', () => {
    expect(LIB).toMatch(/from ['"]@\/lib\/db\/service-client['"]/);
    expect(LIB).not.toMatch(/from ['"]@\/lib\/supabase\/server['"]/);
  });
});

describe('B4.2 — send sites record dead letters', () => {
  it('worker SMS helpers record on Twilio failure and preserve throw semantics', () => {
    expect(SMS_NOTIFY).toMatch(/worker_approved_sms/);
    expect(SMS_NOTIFY).toMatch(/worker_dispute_sms/);
    expect(SMS_NOTIFY).toMatch(/recordNotificationDeadLetter/);
    expect(SMS_NOTIFY).toMatch(/throw err;/);
  });

  it('every Resend send in notify.ts goes through the sendOrRecord wrapper', () => {
    // Exactly one naked resend.emails.send — inside the wrapper itself.
    const naked = EMAIL_NOTIFY.match(/resend\.emails\.send\(/g) ?? [];
    expect(naked).toHaveLength(1);
    expect(EMAIL_NOTIFY).toMatch(/async function sendOrRecord/);
    expect(EMAIL_NOTIFY).toMatch(/payroll_admin_approval/);
    expect(EMAIL_NOTIFY).toMatch(/chain_integrity_alert/);
    expect(EMAIL_NOTIFY).toMatch(/worker_mfa_code/);
  });

  it('the returned-{error} Resend failure mode is captured (SDK does not throw)', () => {
    expect(EMAIL_NOTIFY).toMatch(/result\?\.error/);
    expect(WELCOME).toMatch(/sendResult\?\.error/);
  });

  it('no message bodies or codes ride the dead letter — summary is kind/subject only', () => {
    expect(EMAIL_NOTIFY).not.toMatch(/summary:\s*\{[^}]*text/);
    expect(SMS_NOTIFY).not.toMatch(/summary:\s*\{[^}]*body/);
  });
});

describe('B4.3 — dead letters are surfaced, not lost', () => {
  it('substrate-health records notification_outbound GREEN/RED', () => {
    expect(HEALTH).toMatch(/check_name:\s*['"]notification_outbound['"]/);
    expect(HEALTH).toMatch(/\.is\(['"]replayed_at['"],\s*null\)/);
  });

  it('a missing table degrades to ERROR without failing the whole run (deploy-before-migration safe)', () => {
    expect(HEALTH).toMatch(/notification_outbound_unreadable/);
  });

  it('overall ok goes false when outbound dead letters exist', () => {
    expect(HEALTH).toMatch(/notifStatus !== ['"]RED['"]/);
  });
});

// ── Recorder behaviour (mock-invocation) ─────────────────────────────

const { chokepointMock } = vi.hoisted(() => ({
  chokepointMock: { getServiceClientForSystemJob: vi.fn() },
}));

vi.mock('@/lib/db/service-client', () => ({
  getServiceClientForSystemJob: chokepointMock.getServiceClientForSystemJob,
}));
vi.mock('@/lib/logger', () => ({
  routeLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { recordNotificationDeadLetter } from '../../src/lib/notify/dead-letter';

describe('B4.4 — recordNotificationDeadLetter never throws', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts the row with channel, recipient, summary, error, context', async () => {
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    chokepointMock.getServiceClientForSystemJob.mockReturnValue({
      from: vi.fn(() => ({ insert })),
    });
    await recordNotificationDeadLetter({
      channel: 'twilio_sms',
      recipient: '+61400000000',
      summary: { kind: 'worker_approved_sms' },
      error: 'twilio 503',
      context: { shift_id: 's1' },
    });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'twilio_sms',
        recipient: '+61400000000',
        error: 'twilio 503',
      }),
    );
  });

  it('swallows an insert error (recording is best-effort)', async () => {
    chokepointMock.getServiceClientForSystemJob.mockReturnValue({
      from: vi.fn(() => ({ insert: vi.fn(() => Promise.resolve({ error: { message: 'down' } })) })),
    });
    await expect(
      recordNotificationDeadLetter({
        channel: 'resend_email',
        recipient: 'x@y.z',
        summary: { kind: 'welcome_email' },
        error: 'boom',
      }),
    ).resolves.toBeUndefined();
  });

  it('swallows a thrown client error', async () => {
    chokepointMock.getServiceClientForSystemJob.mockImplementation(() => {
      throw new Error('no env');
    });
    await expect(
      recordNotificationDeadLetter({
        channel: 'resend_email',
        recipient: 'x@y.z',
        summary: { kind: 'welcome_email' },
        error: 'boom',
      }),
    ).resolves.toBeUndefined();
  });
});
