import { describe, it, expect } from 'vitest';
import { matchGrants, type Grant, type FleetCriteria } from './handler';
const criteria: FleetCriteria = {
  jurisdiction: 'ACT',
  country: 'AU',
  sectors: ['saas', 'rd'],
  minAmountCents: 500000,
};
const g = (over: Partial<Grant> & { id: string }): Grant => ({
  title: 'G',
  jurisdictions: ['AU'],
  sectors: ['saas'],
  closesInDays: 30,
  maxAmountCents: 1000000,
  ...over,
});
describe('bot 58 — grant-finder', () => {
  it('matches eligible open grants, soonest-closing first', () => {
    const m = matchGrants(
      [
        g({ id: 'far', closesInDays: 60 }),
        g({ id: 'soon', closesInDays: 10 }),
        g({ id: 'wrong-sector', sectors: ['biotech'] }),
        g({ id: 'closed', closesInDays: -1 }),
        g({ id: 'too-small', maxAmountCents: 100 }),
      ],
      criteria,
    );
    expect(m.map((x) => x.id)).toEqual(['soon', 'far']);
    expect(m[0]?.matchedSectors).toContain('saas');
  });
});
