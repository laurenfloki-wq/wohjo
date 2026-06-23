// Golden evals — bot 8 (newsletter). Send blocked unless compliant.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { assembleNewsletter, type NewsletterInput } from './handler';
import { GuardError } from '../../platform/guard';

const ABN = '12 345 678 901';
const input = (over: Partial<NewsletterInput> = {}): NewsletterInput => ({
  subject: 'FLOSMOSIS monthly',
  intro: 'This month at FLOSMOSIS.',
  items: [{ heading: 'New seals', body: 'We sealed more clock-ons.' }],
  abn: ABN,
  unsubscribeUrl: 'https://flosmosis.example/unsubscribe?token=x',
  ...over,
});

describe('bot 8 — newsletter', () => {
  beforeAll(() => vi.stubEnv('FLOSMOSIS_ABN', ABN));
  afterAll(() => vi.unstubAllEnvs());

  it('assembles a compliant newsletter with ABN and unsubscribe', () => {
    const email = assembleNewsletter(input());
    expect(email.body).toContain(ABN);
    expect(email.body.toLowerCase()).toContain('unsubscribe');
  });

  it('blocks a newsletter containing emoji', () => {
    expect(() => assembleNewsletter(input({ intro: 'This month at FLOSMOSIS 🎉' }))).toThrow(
      GuardError,
    );
  });

  it('blocks when the unsubscribe link is missing', () => {
    expect(() =>
      assembleNewsletter(input({ unsubscribeUrl: 'https://flosmosis.example/home' })),
    ).toThrow(GuardError);
  });
});
