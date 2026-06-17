// Evidence Pack PDF + verify-surface render tests.
//
// Asserts valid, non-trivial output for both the VERIFIED and BROKEN
// verdicts and a multi-shift table (page-flow). When WRITE_SAMPLES is
// set, also dumps artifacts to the Downloads folder for visual review —
// off in CI.

import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'fs';
import { renderAuditPdf } from './render-pdf';
import { renderVerifyPage, renderVerifyNotFound } from './render-verify-page';
import { toVerifyJson } from './verify-result';
import { qrPng, qrSvg } from './qr';
import { verifyUrl } from './verify-url';
import type { AuditPack, AuditShiftSummary } from './types';
import type { VerifyExportMeta } from './verify-pack';

function ev(
  type: string,
  hash: string,
  prev: string | null,
  at: string,
): AuditShiftSummary['events'][number] {
  return {
    id: `evt-${hash.slice(0, 6)}`,
    company_id: '00000000-1000-0000-0000-000000000001',
    worker_id: 'w1',
    site_id: 's1',
    event_type: type,
    event_data: { shift_id: '62bfc2a3', receipt_id: 'FSTR-C3LMPJYS' },
    device_metadata: {},
    event_hash: hash,
    previous_event_hash: prev,
    created_at: at,
    created_by: 'u1',
  };
}

function shift(over: Partial<AuditShiftSummary> = {}): AuditShiftSummary {
  return {
    shift_id: '62bfc2a3-b592-4511-acaf-518044df5144',
    worker_name: 'Joao Muniz Campos',
    worker_employee_id: 'EMP-FLOSMOSIS-TEST-JOAO',
    site_name: 'Mt Stromlo Observatory',
    shift_date: '2026-06-16',
    start_time: '2026-06-16T07:37:00.000Z',
    end_time: '2026-06-16T08:15:00.000Z',
    break_minutes: 15,
    total_hours: 0.37,
    status: 'EXPORTED',
    receipt_id: 'FSTR-C3LMPJYS',
    events: [
      ev(
        'SUPERVISOR_APPROVAL',
        'f4d9fa42e68ad79d1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899',
        '69262a51b0769b1ecafe00112233445566778899aabbccddeeff001122334455',
        '2026-06-16T02:20:54.000Z',
      ),
      ev(
        'PAYROLL_APPROVAL',
        '6e00a6551466b51fa0b1c2d3e4f5061728394a5b6c7d8e9f0011223344556677',
        'f4d9fa42e68ad79d1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899',
        '2026-06-16T02:29:26.000Z',
      ),
      ev(
        'EXPORT_RECORD',
        'f84645888bd59d13a1b2c3d4e5f60718293a4b5c6d7e8f9001122334455667788',
        '6e00a6551466b51fa0b1c2d3e4f5061728394a5b6c7d8e9f0011223344556677',
        '2026-06-16T02:31:37.000Z',
      ),
    ],
    hash_chain_valid: true,
    ...over,
  };
}

function pack(over: Partial<AuditPack> = {}): AuditPack {
  return {
    generated_at: '2026-06-17T01:31:37.000Z',
    company_id: '00000000-1000-0000-0000-000000000001',
    period_start: '2026-06-16',
    period_end: '2026-06-16',
    total_shifts: 1,
    total_events: 3,
    total_hours: 0.37,
    hash_chain_integrity: 'VERIFIED',
    broken_chains: [],
    shifts: [shift()],
    ...over,
  };
}

const FILE_HASH = 'b3569353caaff84f9150c83c8dafc14de54e14989a9e159f56d0b0bf01f39aea';
const meta: VerifyExportMeta = {
  exportId: 'e02b9e19-b40e-43df-a0c9-8ef49d0f54d5',
  companyId: '00000000-1000-0000-0000-000000000001',
  provider: 'employment_hero',
  fileHash: FILE_HASH,
  payPeriodStart: '2026-06-16',
  payPeriodEnd: '2026-06-16',
  exportedAt: '2026-06-16T02:31:37.000Z',
};

const isPdf = (b: Buffer) => b.subarray(0, 5).toString('latin1') === '%PDF-';

describe('renderAuditPdf', () => {
  it('produces a valid, non-trivial PDF for a VERIFIED pack', async () => {
    const url = verifyUrl(meta.fileHash);
    const png = await qrPng(url);
    const buf = await renderAuditPdf({ meta, pack: pack(), url, qrPng: png });
    expect(isPdf(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1500);

    if (process.env.WRITE_SAMPLES) {
      writeFileSync('C:/Users/PC/Downloads/Flostruction_EvidencePack_SAMPLE.pdf', buf);
    }
  });

  it('produces a valid PDF for a BROKEN pack', async () => {
    const url = verifyUrl(meta.fileHash);
    const png = await qrPng(url);
    const broken = pack({
      hash_chain_integrity: 'BROKEN',
      broken_chains: ['62bfc2a3-b592-4511-acaf-518044df5144'],
      shifts: [shift({ hash_chain_valid: false })],
    });
    const buf = await renderAuditPdf({ meta, pack: broken, url, qrPng: png });
    expect(isPdf(buf)).toBe(true);
  });

  it('flows a multi-shift table without throwing', async () => {
    const url = verifyUrl(meta.fileHash);
    const png = await qrPng(url);
    const many = Array.from({ length: 40 }, (_, i) =>
      shift({ shift_id: `s-${i}`, receipt_id: `FSTR-${i}`, total_hours: i % 9 }),
    );
    const buf = await renderAuditPdf({
      meta,
      pack: pack({ total_shifts: many.length, shifts: many }),
      url,
      qrPng: png,
    });
    expect(isPdf(buf)).toBe(true);
  });
});

describe('renderVerifyPage / not-found', () => {
  it('renders a VERIFIED landing page with the verdict, hours and URL', async () => {
    const url = verifyUrl(meta.fileHash);
    const svg = await qrSvg(url);
    const html = renderVerifyPage({ meta, pack: pack(), url, qrSvg: svg });
    expect(html).toContain('Verified');
    expect(html).toContain('0.37');
    expect(html).toContain(url);
    expect(html).toContain('<svg');
    if (process.env.WRITE_SAMPLES) {
      writeFileSync('C:/Users/PC/Downloads/Flostruction_Verify_SAMPLE.html', html);
    }
  });

  it('renders a Failed verification page for a BROKEN pack', async () => {
    const url = verifyUrl(meta.fileHash);
    const svg = await qrSvg(url);
    const html = renderVerifyPage({
      meta,
      pack: pack({
        hash_chain_integrity: 'BROKEN',
        broken_chains: ['x'],
        shifts: [shift({ hash_chain_valid: false })],
      }),
      url,
      qrSvg: svg,
    });
    expect(html).toContain('Failed verification');
  });

  it('not-found page warns the document may be altered', () => {
    expect(renderVerifyNotFound()).toContain('No matching record');
  });
});

describe('toVerifyJson', () => {
  it('maps a VERIFIED pack to the machine contract', () => {
    const url = verifyUrl(meta.fileHash);
    const j = toVerifyJson(meta, pack(), url);
    expect(j.wles_verification).toBe('1');
    expect(j.status).toBe('VERIFIED');
    expect(j.file_hash).toBe(FILE_HASH);
    expect(j.totals).toEqual({ shifts: 1, hours: 0.37, events: 3 });
    expect(j.shifts[0]).toMatchObject({
      receipt_id: 'FSTR-C3LMPJYS',
      hours: 0.37,
      chain: 'VERIFIED',
    });
    expect(j.verify_url).toBe(url);
  });

  it('marks BROKEN and lists the broken shift ids', () => {
    const j = toVerifyJson(
      meta,
      pack({
        hash_chain_integrity: 'BROKEN',
        broken_chains: ['abc'],
        shifts: [shift({ hash_chain_valid: false })],
      }),
      verifyUrl(meta.fileHash),
    );
    expect(j.status).toBe('BROKEN');
    expect(j.broken_shift_ids).toEqual(['abc']);
    expect(j.shifts[0].chain).toBe('BROKEN');
    expect(j.statement).toContain('Do not pay');
  });
});
