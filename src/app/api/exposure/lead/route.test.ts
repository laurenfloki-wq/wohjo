// /api/exposure/lead — lead capture. The repository, email senders, PDF
// renderer, and CRM modules are mocked; after() is made a no-op so the handler
// can run outside a request scope. We assert the persist-first order, failure
// tolerance, and the post-response CRM follow-up.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  createSubmission,
  createLead,
  updateLeadHubspotStatus,
  founderHandoff,
  userReport,
  renderPdf,
  enrich,
  hubspotSync,
} = vi.hoisted(() => ({
  createSubmission: vi.fn(),
  createLead: vi.fn(),
  updateLeadHubspotStatus: vi.fn(),
  founderHandoff: vi.fn(),
  userReport: vi.fn(),
  renderPdf: vi.fn(),
  enrich: vi.fn(),
  hubspotSync: vi.fn(),
}));

// after() runs post-response in the Next runtime; in unit tests there is no
// request scope, so make it a no-op (we test the follow-up function directly).
vi.mock('next/server', async (orig) => {
  const actual = await orig<typeof import('next/server')>();
  return { ...actual, after: (_fn: () => void) => void _fn };
});
vi.mock('@/lib/db/repositories/exposure.repo', () => ({
  exposureRepo: () => ({ createSubmission, createLead, updateLeadHubspotStatus }),
}));
vi.mock('@/lib/email/notify', () => ({
  sendExposureFounderHandoff: founderHandoff,
  sendExposureUserReport: userReport,
}));
vi.mock('@/lib/exposure/report-pdf', () => ({ renderExposureReportPdf: renderPdf }));
vi.mock('@/lib/exposure/apollo', () => ({ enrichCompany: enrich }));
vi.mock('@/lib/exposure/hubspot', () => ({ syncExposureLeadToHubSpot: hubspotSync }));

import { POST, runExposureCrmFollowups } from './route';

const VALID = {
  name: 'Sam Director',
  work_email: 'sam@buildco.com.au',
  company: 'BuildCo Labour Hire',
  role: 'Director',
  phone: '',
  consent: true,
  answers: {
    states: ['queensland'],
    worker_band: '21-50',
    records_method: 'paper',
    records_survive: 'no',
    super_cadence: 'quarterly',
    director_aware: 'no',
  },
  version: '2026-06-28-draft.1',
};

function post(body: unknown, ip: string) {
  return POST(
    new Request('http://localhost/api/exposure/lead', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  createSubmission.mockResolvedValue({ data: { id: 'sub_1' }, error: null });
  createLead.mockResolvedValue({ data: { id: 'lead_1' }, error: null });
  updateLeadHubspotStatus.mockResolvedValue({ error: null });
  founderHandoff.mockResolvedValue(undefined);
  userReport.mockResolvedValue(undefined);
  renderPdf.mockResolvedValue(Buffer.from('%PDF-1.7'));
  enrich.mockResolvedValue(null);
  hubspotSync.mockResolvedValue('skipped');
});

describe('POST /api/exposure/lead', () => {
  it('persists submission + lead, renders a PDF, then emails founder and user', async () => {
    const res = await post(VALID, '10.30.0.1');
    expect(res.status).toBe(200);
    expect((await res.json()) as { success: boolean }).toEqual({ success: true });

    expect(createSubmission).toHaveBeenCalledTimes(1);
    expect(createLead).toHaveBeenCalledTimes(1);
    expect(createSubmission.mock.invocationCallOrder[0]).toBeLessThan(
      founderHandoff.mock.invocationCallOrder[0],
    );
    expect(founderHandoff).toHaveBeenCalledTimes(1);
    expect(userReport).toHaveBeenCalledTimes(1);
    // the user report carries the rendered PDF
    expect((userReport.mock.calls[0][0] as { pdf?: Buffer }).pdf).toBeInstanceOf(Buffer);

    const subArg = createSubmission.mock.calls[0][0] as { overall: string };
    expect(['clear', 'watch', 'exposed']).toContain(subArg.overall);
  });

  it('still emails the founder when the lead row fails (no lead lost)', async () => {
    createLead.mockResolvedValue({ data: null, error: { message: 'insert failed' } });
    const res = await post(VALID, '10.30.0.2');
    expect(res.status).toBe(200);
    expect(founderHandoff).toHaveBeenCalledTimes(1);
  });

  it('returns 502 if the submission cannot be persisted', async () => {
    createSubmission.mockResolvedValue({ data: null, error: { message: 'db down' } });
    const res = await post(VALID, '10.30.0.3');
    expect(res.status).toBe(502);
    expect(founderHandoff).not.toHaveBeenCalled();
  });

  it('rejects capture without consent (APP) with 400', async () => {
    const res = await post({ ...VALID, consent: false }, '10.30.0.4');
    expect(res.status).toBe(400);
    expect(createSubmission).not.toHaveBeenCalled();
  });
});

describe('runExposureCrmFollowups (post-response)', () => {
  it('enriches, syncs to HubSpot, and records the sync status', async () => {
    hubspotSync.mockResolvedValue('synced');
    await runExposureCrmFollowups({
      lead: { name: 'Sam', work_email: 'sam@buildco.com.au', company: 'BuildCo', role: null, phone: null },
      // minimal result shape is fine — the modules are mocked
      result: { version: 'v', vectors: [], biggestGap: null, states: [], workerBand: null, overall: 'clear', founderOpener: '' },
      leadId: 'lead_1',
    });
    expect(enrich).toHaveBeenCalledWith('sam@buildco.com.au');
    expect(hubspotSync).toHaveBeenCalledTimes(1);
    expect(updateLeadHubspotStatus).toHaveBeenCalledWith('lead_1', 'synced');
  });
});
