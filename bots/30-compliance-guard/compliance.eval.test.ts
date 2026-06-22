// Golden evals — bot 30 (compliance guard). Pure, no infra.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  assertSpamActCompliant,
  assertNoEmoji,
  assertGrounded,
  GuardError,
  type OutboundEmail,
} from '../../platform/guard';
import { expectGuardCode } from '../../evals/assert';

const ABN = '12 345 678 901';
const UNSUB = 'https://flosmosis.example/unsubscribe?token=abc';

function compliantEmail(): OutboundEmail {
  return {
    to: 'lead@example.com',
    subject: 'FLOSTRUCTION pilot',
    body: `Hello,\n\nFLOSMOSIS PTY LTD ABN ${ABN}.\nUnsubscribe: ${UNSUB}`,
  };
}

describe('bot 30 — compliance guard', () => {
  beforeAll(() => {
    vi.stubEnv('FLOSMOSIS_ABN', ABN);
    vi.stubEnv('FLOSMOSIS_UNSUBSCRIBE_BASE_URL', 'https://flosmosis.example/unsubscribe');
  });
  afterAll(() => vi.unstubAllEnvs());

  it('passes a compliant email', () => {
    expect(() => assertSpamActCompliant(compliantEmail())).not.toThrow();
  });

  it('blocks an email missing the ABN', () => {
    const e = compliantEmail();
    e.body = `Hello,\nUnsubscribe: ${UNSUB}`;
    expectGuardCode(() => assertSpamActCompliant(e), 'ABN_MISSING');
  });

  it('blocks an email missing a functional unsubscribe', () => {
    const e = compliantEmail();
    e.body = `Hello,\nFLOSMOSIS PTY LTD ABN ${ABN}.`;
    expectGuardCode(() => assertSpamActCompliant(e), 'UNSUBSCRIBE_MISSING');
  });

  it('blocks an email containing emoji (output hygiene)', () => {
    const e = compliantEmail();
    e.body = `Great news \u{1F389} FLOSMOSIS PTY LTD ABN ${ABN}. Unsubscribe: ${UNSUB}`;
    expect(() => assertSpamActCompliant(e)).toThrow(GuardError);
  });

  it('assertNoEmoji throws EMOJI code', () => {
    expectGuardCode(() => assertNoEmoji('done ✅'), 'EMOJI');
  });

  it('grounded answer requires citations within the source set', () => {
    expect(() => assertGrounded({ sources: [{ id: 's1' }], citedIds: ['s1'] })).not.toThrow();
    expectGuardCode(
      () => assertGrounded({ sources: [{ id: 's1' }], citedIds: ['s2'] }),
      'CITATION_NOT_IN_SOURCES',
    );
    expectGuardCode(() => assertGrounded({ sources: [], citedIds: [] }), 'NO_SOURCES');
  });
});
