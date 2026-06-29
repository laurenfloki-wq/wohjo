// HubSpot mapping — pure request-builders. No network. Confirms we map to
// EXISTING standard/custom properties (no duplicates) and that the diagnosis +
// opener land in the Note body. syncExposureLeadToHubSpot no-ops to 'skipped'
// when no token is configured.

import { describe, it, expect } from 'vitest';
import { buildContactProperties, buildNoteBody, syncExposureLeadToHubSpot } from './hubspot';
import type { ExposureResult } from './types';

const RESULT: ExposureResult = {
  version: '2026-06-28-draft.1',
  overall: 'exposed',
  biggestGap: 'records',
  states: ['queensland', 'victoria'],
  workerBand: '21-50',
  founderOpener: 'You told us hours are on paper across QLD and VIC — want to see a defensible record?',
  vectors: [
    { vector: 'records', label: 'Records & evidence', blurb: 'b', band: 'exposed', score: 80, applicable: true, nextStep: 'capture at the point of work', source: { label: 'FWO', url: 'https://x' } },
    { vector: 'licensing', label: 'Labour hire licensing', blurb: 'b', band: 'watch', score: 50, applicable: true, nextStep: 'confirm licence', source: { label: 'LHLQ', url: 'https://y' } },
  ],
};

const LEAD = { name: 'Sam Director', work_email: 'sam@buildco.com.au', company: 'BuildCo', role: 'Director', phone: '0400000000', source: null };

describe('buildContactProperties', () => {
  it('maps to existing standard + flostruction_source properties only', () => {
    const p = buildContactProperties(LEAD, RESULT);
    expect(p.email).toBe('sam@buildco.com.au');
    expect(p.firstname).toBe('Sam');
    expect(p.lastname).toBe('Director');
    expect(p.company).toBe('BuildCo');
    expect(p.jobtitle).toBe('Director');
    expect(p.phone).toBe('0400000000');
    expect(p.flostruction_source).toBe('labour-hire-exposure-check');
    expect(p.message).toContain('Exposed');
    expect(p.message).toContain('Medium priority'); // P6: worker band 21-50 + exposed
    // never invents bespoke scoring properties
    expect(Object.keys(p)).not.toContain('payday_super');
  });

  it('omits empty optional fields', () => {
    const p = buildContactProperties({ ...LEAD, role: null, phone: null }, RESULT);
    expect('jobtitle' in p).toBe(false);
    expect('phone' in p).toBe(false);
  });
});

describe('buildNoteBody', () => {
  it('includes the per-vector bands and the suggested opener', () => {
    const body = buildNoteBody(RESULT);
    expect(body).toContain('Priority: Medium'); // P6
    expect(body).toContain('Records & evidence: Exposed');
    expect(body).toContain('Labour hire licensing: Watch');
    expect(body).toContain('Suggested opener:');
    expect(body).toContain('defensible record');
  });

  it('appends Apollo firmographics when present', () => {
    const body = buildNoteBody(RESULT, { industry: 'Construction', employees: 42, website: 'buildco.com.au' });
    expect(body).toContain('Construction');
    expect(body).toContain('42');
  });
});

describe('syncExposureLeadToHubSpot', () => {
  it('skips cleanly when no token is configured', async () => {
    const prev = process.env.HUBSPOT_ACCESS_TOKEN;
    delete process.env.HUBSPOT_ACCESS_TOKEN;
    const status = await syncExposureLeadToHubSpot({ lead: LEAD, result: RESULT, timestampIso: '2026-06-28T00:00:00.000Z' });
    expect(status).toBe('skipped');
    if (prev !== undefined) process.env.HUBSPOT_ACCESS_TOKEN = prev;
  });
});
