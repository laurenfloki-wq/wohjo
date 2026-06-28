// /api/exposure/lead — lead capture. The repository and email senders are
// mocked; we assert the persist-first order and failure tolerance:
//   * happy path persists submission + lead, then emails founder + user, 200
//   * lead-row failure still emails the founder (no lead is ever lost)
//   * missing consent → 400 (APP consent is mandatory)

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createSubmission, createLead, founderHandoff, userReport } = vi.hoisted(() => ({
  createSubmission: vi.fn(),
  createLead: vi.fn(),
  founderHandoff: vi.fn(),
  userReport: vi.fn(),
}));

vi.mock('@/lib/db/repositories/exposure.repo', () => ({
  exposureRepo: () => ({ createSubmission, createLead }),
}));
vi.mock('@/lib/email/notify', () => ({
  sendExposureFounderHandoff: founderHandoff,
  sendExposureUserReport: userReport,
}));

import { POST } from './route';

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
  createSubmission.mockReset();
  createLead.mockReset();
  founderHandoff.mockReset();
  userReport.mockReset();
  createSubmission.mockResolvedValue({ data: { id: 'sub_1' }, error: null });
  createLead.mockResolvedValue({ data: { id: 'lead_1' }, error: null });
  founderHandoff.mockResolvedValue(undefined);
  userReport.mockResolvedValue(undefined);
});

describe('POST /api/exposure/lead', () => {
  it('persists submission + lead then emails founder and user', async () => {
    const res = await post(VALID, '10.20.0.1');
    expect(res.status).toBe(200);
    expect((await res.json()) as { success: boolean }).toEqual({ success: true });

    expect(createSubmission).toHaveBeenCalledTimes(1);
    expect(createLead).toHaveBeenCalledTimes(1);
    // persist must happen before notify
    expect(createSubmission.mock.invocationCallOrder[0]).toBeLessThan(
      founderHandoff.mock.invocationCallOrder[0],
    );
    expect(founderHandoff).toHaveBeenCalledTimes(1);
    expect(userReport).toHaveBeenCalledTimes(1);

    // server re-scores: submission carries the authoritative overall band
    const subArg = createSubmission.mock.calls[0][0] as { overall: string };
    expect(['clear', 'watch', 'exposed']).toContain(subArg.overall);
  });

  it('still emails the founder when the lead row fails (no lead lost)', async () => {
    createLead.mockResolvedValue({ data: null, error: { message: 'insert failed' } });
    const res = await post(VALID, '10.20.0.2');
    expect(res.status).toBe(200);
    expect(founderHandoff).toHaveBeenCalledTimes(1);
  });

  it('returns 502 if the submission cannot be persisted', async () => {
    createSubmission.mockResolvedValue({ data: null, error: { message: 'db down' } });
    const res = await post(VALID, '10.20.0.3');
    expect(res.status).toBe(502);
    expect(founderHandoff).not.toHaveBeenCalled();
  });

  it('rejects capture without consent (APP) with 400', async () => {
    const res = await post({ ...VALID, consent: false }, '10.20.0.4');
    expect(res.status).toBe(400);
    expect(createSubmission).not.toHaveBeenCalled();
  });
});
