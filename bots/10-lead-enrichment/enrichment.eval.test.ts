// Golden evals — bot 10 (lead enrichment). Normalise + dedupe.

import { describe, it, expect } from 'vitest';
import { normalise, dedupe, normaliseAuPhone } from './handler';

describe('bot 10 — lead enrichment', () => {
  it('normalises email, name case, and AU phone', () => {
    const n = normalise({
      email: '  Jane@Example.COM ',
      firstName: 'jane',
      lastName: 'DOE',
      phone: '0412 345 678',
      company: '  Acme  ',
    });
    expect(n.email).toBe('jane@example.com');
    expect(n.firstName).toBe('Jane');
    expect(n.lastName).toBe('Doe');
    expect(n.phone).toBe('+61412345678');
    expect(n.company).toBe('Acme');
    expect(n.dedupeKey).toBe('jane@example.com');
  });

  it('normaliseAuPhone keeps + prefixed, nulls empty', () => {
    expect(normaliseAuPhone('+61400000000')).toBe('+61400000000');
    expect(normaliseAuPhone('   ')).toBeNull();
  });

  it('dedupes by email, keeping first occurrence', () => {
    const a = normalise({ email: 'x@y.com', firstName: 'A' });
    const b = normalise({ email: 'X@Y.com', firstName: 'B' });
    const out = dedupe([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0]?.firstName).toBe('A');
  });
});
