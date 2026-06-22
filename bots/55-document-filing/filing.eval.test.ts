import { describe, it, expect } from 'vitest';
import { buildFileName, nextVersion, retentionYears } from './handler';
describe('bot 55 — document filing', () => {
  it('builds a deterministic, slug-safe name', () => {
    expect(
      buildFileName({
        type: 'invoice',
        subject: 'Acme Labour Hire',
        isoDate: '2026-06-22',
        version: 2,
      }),
    ).toBe('invoice_acme-labour-hire_2026-06-22_v2');
  });
  it('computes next version', () => {
    expect(nextVersion([])).toBe(1);
    expect(nextVersion([1, 3, 2])).toBe(4);
  });
  it('applies AU retention defaults', () => {
    expect(retentionYears('invoice')).toBe(5);
    expect(retentionYears('contract')).toBe(7);
  });
});
