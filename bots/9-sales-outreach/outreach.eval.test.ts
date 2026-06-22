// Golden evals — bot 9 (sales outreach). Compliance enforced before send-edge.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildOutreachEmail, type OutreachInput } from './handler';
import { GuardError } from '../../platform/guard';

const ABN = '12 345 678 901';
const input = (over: Partial<OutreachInput> = {}): OutreachInput => ({
  toEmail: 'lead@example.com',
  subject: 'FLOSTRUCTION for your crew',
  bodyDraft: 'Hi, FLOSTRUCTION seals each clock-on as evidence.',
  abn: ABN,
  unsubscribeUrl: 'https://flosmosis.example/unsubscribe?token=x',
  ...over,
});

describe('bot 9 — sales outreach', () => {
  beforeAll(() => vi.stubEnv('FLOSMOSIS_ABN', ABN));
  afterAll(() => vi.unstubAllEnvs());

  it('builds a compliant outreach email (ABN + unsubscribe)', () => {
    const email = buildOutreachEmail(input());
    expect(email.body).toContain(ABN);
    expect(email.body.toLowerCase()).toContain('unsubscribe');
  });

  it('blocks emoji and missing unsubscribe', () => {
    expect(() => buildOutreachEmail(input({ bodyDraft: 'Hey 👋' }))).toThrow(GuardError);
    expect(() =>
      buildOutreachEmail(input({ unsubscribeUrl: 'https://flosmosis.example/home' })),
    ).toThrow(GuardError);
  });
});
