import { describe, it, expect } from 'vitest';
import { noIdentityErrorMessage } from './auth-messages';

describe('noIdentityErrorMessage', () => {
  it('returns admin message when redirect param is /command/dashboard', () => {
    expect(noIdentityErrorMessage('/command/dashboard')).toBe(
      'Phone number not enrolled as admin. Contact your co-director.',
    );
  });

  it('returns worker message when redirect param is null', () => {
    expect(noIdentityErrorMessage(null)).toBe(
      'Phone number not enrolled as worker. Contact your supervisor.',
    );
  });

  it('returns worker message when redirect param points elsewhere', () => {
    expect(noIdentityErrorMessage('/field/home')).toBe(
      'Phone number not enrolled as worker. Contact your supervisor.',
    );
  });

  it('returns worker message when redirect param is an empty string', () => {
    expect(noIdentityErrorMessage('')).toBe(
      'Phone number not enrolled as worker. Contact your supervisor.',
    );
  });
});
