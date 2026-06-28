// /api/exposure/lead — lead capture. Repository, email senders, PDF renderer,
// and CRM modules are mocked; after() is a no-op so the handler runs outside a
// request scope (the post-response work is tested directly). Covers:
//   * persist-first → 200 (emails/PDF/CRM run post-response, not on the path)
//   * submission failure → 502; lead-row failure tolerated
//   * APP consent required
//   * P2 bot checks: honeypot + min submit time
//   * P9 bounded answers: unknown id / unknown choice value → 400
//   * runExposureFollowups: founder + user(PDF) + CRM, and no-lead-lost

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

import { POST, runExposureFollowups } from './route';

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
  elapsed_ms: 5000,
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
  it('persists submission + lead and returns 200 (sends run post-response)', async () => {
    const res = await post(VALID, '10.40.0.1');
    expect(res.status).toBe(200);
    expect((await res.json()) as { success: boolean }).toEqual({ success: true });
    expect(createSubmission).toHaveBeenCalledTimes(1);
    expect(createLead).toHaveBeenCalledTimes(1);
    const subArg = createSubmission.mock.calls[0][0] as { overall: string };
    expect(['clear', 'watch', 'exposed']).toContain(subArg.overall);
  });

  it('returns 502 if the submission cannot be persisted', async () => {
    createSubmission.mockResolvedValue({ data: null, error: { message: 'db down' } });
    const res = await post(VALID, '10.40.0.2');
    expect(res.status).toBe(502);
  });

  it('tolerates a failed lead row (submission still saved) and returns 200', async () => {
    createLead.mockResolvedValue({ data: null, error: { message: 'insert failed' } });
    const res = await post(VALID, '10.40.0.3');
    expect(res.status).toBe(200);
  });

  it('rejects capture without consent (APP) with 400', async () => {
    const res = await post({ ...VALID, consent: false }, '10.40.0.4');
    expect(res.status).toBe(400);
    expect(createSubmission).not.toHaveBeenCalled();
  });

  it('rejects a filled honeypot with 400 (P2)', async () => {
    const res = await post({ ...VALID, hp: 'http://spam.example' }, '10.40.0.5');
    expect(res.status).toBe(400);
    expect(createSubmission).not.toHaveBeenCalled();
  });

  it('rejects an implausibly fast submit with 400 (P2)', async () => {
    const res = await post({ ...VALID, elapsed_ms: 250 }, '10.40.0.6');
    expect(res.status).toBe(400);
    expect(createSubmission).not.toHaveBeenCalled();
  });

  it('rejects an unknown question id with 400 (P9)', async () => {
    const res = await post({ ...VALID, answers: { ...VALID.answers, bogus_question: 'x' } }, '10.40.0.7');
    expect(res.status).toBe(400);
  });

  it('rejects an unknown choice value with 400 (P9)', async () => {
    const res = await post({ ...VALID, answers: { ...VALID.answers, super_cadence: 'never' } }, '10.40.0.8');
    expect(res.status).toBe(400);
  });
});

describe('runExposureFollowups (post-response)', () => {
  const LEAD = { name: 'Sam Director', work_email: 'sam@buildco.com.au', company: 'BuildCo', role: null, phone: null };
  const RESULT = {
    version: 'v',
    vectors: [],
    biggestGap: null,
    states: [],
    workerBand: null,
    overall: 'clear' as const,
    founderOpener: '',
  };

  it('sends founder + user(PDF) report, enriches, syncs, records status', async () => {
    hubspotSync.mockResolvedValue('synced');
    await runExposureFollowups({ lead: LEAD, result: RESULT, submissionId: 'sub_1', leadId: 'lead_1' });
    expect(founderHandoff).toHaveBeenCalledTimes(1);
    expect(userReport).toHaveBeenCalledTimes(1);
    expect((userReport.mock.calls[0][0] as { pdf?: Buffer }).pdf).toBeInstanceOf(Buffer);
    expect(enrich).toHaveBeenCalledWith('sam@buildco.com.au');
    expect(hubspotSync).toHaveBeenCalledTimes(1);
    expect(updateLeadHubspotStatus).toHaveBeenCalledWith('lead_1', 'synced');
  });

  it('still emails the founder when the lead row was lost (leadId null)', async () => {
    await runExposureFollowups({ lead: LEAD, result: RESULT, submissionId: 'sub_1', leadId: null });
    expect(founderHandoff).toHaveBeenCalledTimes(1);
    expect(updateLeadHubspotStatus).not.toHaveBeenCalled();
  });
});
