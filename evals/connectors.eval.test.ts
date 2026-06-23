// Golden evals — connector pure mappers (read layer). No network.

import { describe, it, expect } from 'vitest';
import { toCrmContact, type HubSpotContact } from '../platform/connectors/hubspot';
import { parseProfitAndLoss, type XeroReport } from '../platform/connectors/xero';
import { isRdEligibleCommit } from '../platform/connectors/github';

describe('connector: HubSpot -> CRM contact', () => {
  const now = Date.parse('2026-06-22T00:00:00Z');
  const c = (props: Record<string, string | null>): HubSpotContact => ({
    id: 'x',
    properties: props,
  });

  it('maps a healthy contact', () => {
    const out = toCrmContact(
      c({ email: 'A@B.com', notes_last_updated: '2026-06-20T00:00:00Z', lifecyclestage: 'lead' }),
      now,
    );
    expect(out.emailStatus).toBe('valid');
    expect(out.lastActivityDaysAgo).toBe(2);
    expect(out.stage).toBe('lead');
  });

  it('flags a hard bounce and missing activity', () => {
    const out = toCrmContact(
      c({ email: 'x@y.com', hs_email_hard_bounce_reason: 'mailbox full' }),
      now,
    );
    expect(out.emailStatus).toBe('hard_bounce');
    expect(out.lastActivityDaysAgo).toBe(9999);
  });
});

describe('connector: Xero ProfitAndLoss parse', () => {
  const report: XeroReport = {
    Reports: [
      {
        Rows: [
          {
            RowType: 'Section',
            Rows: [
              { RowType: 'SummaryRow', Cells: [{ Value: 'Total Income' }, { Value: '1000.00' }] },
              {
                RowType: 'SummaryRow',
                Cells: [{ Value: 'Total Cost of Sales' }, { Value: '200.00' }],
              },
              {
                RowType: 'SummaryRow',
                Cells: [{ Value: 'Total Operating Expenses' }, { Value: '500.00' }],
              },
            ],
          },
        ],
      },
    ],
  };

  it('extracts revenue, cogs, opex in cents', () => {
    const f = parseProfitAndLoss(report);
    expect(f.revenueCents).toBe(100000);
    expect(f.cogsCents).toBe(20000);
    expect(f.opexCents).toBe(50000);
  });

  it('defaults missing rows to zero', () => {
    expect(parseProfitAndLoss({ Reports: [{ Rows: [] }] })).toEqual({
      revenueCents: 0,
      cogsCents: 0,
      opexCents: 0,
    });
  });
});

describe('connector: GitHub R&D eligibility', () => {
  it('flags experimental development commits', () => {
    expect(isRdEligibleCommit('feat(seal): new chain')).toBe(true);
    expect(isRdEligibleCommit('perf: faster hash')).toBe(true);
    expect(isRdEligibleCommit('refactor: extract module')).toBe(true);
    expect(isRdEligibleCommit('docs: update readme')).toBe(false);
    expect(isRdEligibleCommit('chore: bump deps')).toBe(false);
  });
});
