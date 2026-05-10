// Observability shim — redaction unit tests.
// Verifies that no PII shape survives `safeMessage`/`redact`.

import { describe, it, expect } from 'vitest';
import { redact, truncate, safeMessage } from './redact';

describe('redact', () => {
  it('replaces Australian mobile numbers with [PHONE]', () => {
    expect(redact('Failed for +61412345678')).toBe('Failed for [PHONE]');
  });

  it('replaces local 10-digit phone numbers with [PHONE]', () => {
    expect(redact('worker 0412345678 missing')).toBe('worker [PHONE] missing');
  });

  it('replaces email addresses with [EMAIL]', () => {
    expect(redact('SMTP error for lauren.de.mestre@au.pwc.com')).toBe(
      'SMTP error for [EMAIL]',
    );
  });

  it('replaces UUIDs with [UUID]', () => {
    expect(redact('shift 35b06f94-32dd-81f5-a7ac-d837940779c2 not found')).toBe(
      'shift [UUID] not found',
    );
  });

  it('replaces uppercase UUIDs (case-insensitive)', () => {
    expect(redact('SHIFT 35B06F94-32DD-81F5-A7AC-D837940779C2')).toBe(
      'SHIFT [UUID]',
    );
  });

  it('redacts multiple distinct PII shapes in one string', () => {
    const input =
      'worker +61412345678 (lauren@example.com) shift 35b06f94-32dd-81f5-a7ac-d837940779c2 failed';
    const out = redact(input);
    expect(out).not.toContain('61412345678');
    expect(out).not.toContain('lauren@example.com');
    expect(out).not.toContain('35b06f94');
    expect(out).toContain('[PHONE]');
    expect(out).toContain('[EMAIL]');
    expect(out).toContain('[UUID]');
  });

  it('redacts repeated occurrences globally, not just the first', () => {
    expect(redact('a@b.com and c@d.com')).toBe('[EMAIL] and [EMAIL]');
  });

  it('returns empty string unchanged', () => {
    expect(redact('')).toBe('');
  });

  it('leaves non-PII text untouched', () => {
    expect(redact('database connection refused on port 5432')).toBe(
      'database connection refused on port 5432',
    );
  });
});

describe('truncate', () => {
  it('returns input unchanged when shorter than max', () => {
    expect(truncate('short', 100)).toBe('short');
  });

  it('truncates and appends ellipsis when over max', () => {
    const input = 'x'.repeat(600);
    const out = truncate(input, 500);
    expect(out.length).toBe(501); // 500 + ellipsis
    expect(out.endsWith('…')).toBe(true);
  });

  it('defaults to a 500 char cap', () => {
    const input = 'y'.repeat(600);
    expect(truncate(input).length).toBe(501);
  });
});

describe('safeMessage', () => {
  it('redacts then truncates', () => {
    const tail = 'lauren@example.com';
    const input = 'x'.repeat(490) + ' ' + tail;
    const out = safeMessage(input, 500);
    expect(out).not.toContain(tail);
    expect(out.length).toBeLessThanOrEqual(501);
  });
});
