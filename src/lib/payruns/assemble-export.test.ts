// assemblePayrollExport — the shared pay-run export money path.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  getFormatter: vi.fn(),
  isWlesV1Enabled: vi.fn(),
  sealEvent: vi.fn(),
  buildExportRecord: vi.fn(),
  generateEventHash: vi.fn(),
  exportChainTail: vi.fn(),
  insertExport: vi.fn(),
  markExported: vi.fn(),
  v1ChainTail: vi.fn(),
  insertV1: vi.fn(),
  insertV0Event: vi.fn(),
}));

vi.mock('@/lib/export/formatters', () => ({ getFormatter: h.getFormatter }));
vi.mock('@/lib/wles/flags', () => ({ isWlesV1Enabled: h.isWlesV1Enabled }));
vi.mock('@/lib/wles/v1', () => ({ sealEvent: h.sealEvent }));
vi.mock('@/lib/wles/v1-translate', () => ({ buildExportRecord: h.buildExportRecord }));
vi.mock('@/lib/wles/hash', () => ({ generateEventHash: h.generateEventHash }));
vi.mock('@/lib/db/repositories/shifts.repo', () => ({
  exportChainTail: h.exportChainTail,
  shiftsMutationRepo: () => ({ markExported: h.markExported }),
  shiftEventsMutationRepo: () => ({
    v1ChainTail: h.v1ChainTail,
    insertV1: h.insertV1,
    insertV0Event: h.insertV0Event,
  }),
}));
vi.mock('@/lib/db/repositories/exports.repo', () => ({
  exportsRepo: () => ({ insertExport: h.insertExport }),
}));

import { assemblePayrollExport } from './assemble-export';
import type { ApprovedShift } from '@/lib/export/types';

const SHIFT: ApprovedShift = {
  id: 'a1',
  worker_id: 'w1',
  worker_employee_id: 'EMP-1',
  worker_first_name: 'Joao',
  worker_last_name: 'Silva',
  site_id: 'site1',
  site_name: 'Mt Stromlo',
  company_id: 'co1',
  shift_date: '2026-06-10',
  start_time: '2026-06-09T21:00:00.000Z',
  end_time: '2026-06-10T05:30:00.000Z',
  break_minutes: 30,
  total_hours: 8,
  pay_rate: 28.47,
  status: 'PAYROLL_APPROVED',
  receipt_id: 'FSTR-AB12CD34',
  notes: '',
};

const FORMATTER = {
  providerId: 'employment_hero',
  providerName: 'Employment Hero',
  fileExtension: 'csv',
  mimeType: 'text/csv',
  validate: vi.fn(() => [] as Array<{ shiftId: string; field: string; message: string }>),
  format: vi.fn(() => 'csv,bytes'),
};

const base = {
  companyId: 'co1',
  adminUserId: 'admin1',
  providerId: 'employment_hero',
  payPeriodStart: '2026-06-04',
  payPeriodEnd: '2026-06-10',
};

beforeEach(() => {
  vi.clearAllMocks();
  h.getFormatter.mockReturnValue(FORMATTER);
  FORMATTER.validate.mockReturnValue([]);
  FORMATTER.format.mockReturnValue('csv,bytes');
  h.isWlesV1Enabled.mockReturnValue(true);
  h.exportChainTail.mockResolvedValue({ data: { event_hash: 'prevhash' } });
  h.insertExport.mockResolvedValue({ data: { id: 'exp-1' }, error: null });
  h.v1ChainTail.mockResolvedValue('v1tail');
  h.buildExportRecord.mockReturnValue({ unsealed: true });
  h.sealEvent.mockReturnValue({ sealed: true, event_type: 'X-FLOSMOSIS-EXPORT_RECORD' });
  h.insertV1.mockResolvedValue({ data: { id: 'ev-1' }, error: null });
  h.insertV0Event.mockResolvedValue({ data: { id: 'ev-0' }, error: null });
  h.generateEventHash.mockReturnValue('v0hash');
  h.markExported.mockResolvedValue({ error: null });
});

describe('assemblePayrollExport', () => {
  it('404 when there are no approved shifts — no export row written', async () => {
    const r = await assemblePayrollExport({ ...base, shifts: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
    expect(h.insertExport).not.toHaveBeenCalled();
  });

  it('422 when the formatter reports validation errors', async () => {
    FORMATTER.validate.mockReturnValue([{ shiftId: 'a1', field: 'pay_rate', message: 'bad' }]);
    const r = await assemblePayrollExport({ ...base, shifts: [SHIFT] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(422);
    expect(h.insertExport).not.toHaveBeenCalled();
  });

  it('500 when the export record fails to insert', async () => {
    h.insertExport.mockResolvedValue({ data: null, error: { message: 'db down' } });
    const r = await assemblePayrollExport({ ...base, shifts: [SHIFT] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(500);
  });

  it('seals a v1 EXPORT_RECORD per shift + marks exported (v1 enabled)', async () => {
    const r = await assemblePayrollExport({ ...base, shifts: [SHIFT] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.exportId).toBe('exp-1');
      expect(r.shiftCount).toBe(1);
      expect(r.content).toContain('FLOSTRUCTION-EXPORT-SHA256');
    }
    expect(h.sealEvent).toHaveBeenCalledTimes(1);
    const insertV1Opts = h.insertV1.mock.calls[0]?.[1] as { eventTypeForSubstrate: string };
    expect(insertV1Opts.eventTypeForSubstrate).toBe('EXPORT_RECORD');
    expect(h.insertV0Event).not.toHaveBeenCalled();
    expect(h.markExported).toHaveBeenCalledWith('a1', 'exp-1', expect.any(String));
  });

  it('falls back to a v0 EXPORT_RECORD when the v1 flag is off', async () => {
    h.isWlesV1Enabled.mockReturnValue(false);
    const r = await assemblePayrollExport({ ...base, shifts: [SHIFT] });
    expect(r.ok).toBe(true);
    expect(h.insertV0Event).toHaveBeenCalledTimes(1);
    expect(h.insertV1).not.toHaveBeenCalled();
    expect(h.markExported).toHaveBeenCalledTimes(1);
  });
});
