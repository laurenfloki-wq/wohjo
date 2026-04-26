// Flostruction Audit — HTML Renderer Tests

import { describe, it, expect } from 'vitest';
import { renderAuditHtml } from './render-html';
import type { AuditPack } from './types';

function makeAuditPack(overrides: Partial<AuditPack> = {}): AuditPack {
  return {
    generated_at: '2025-04-07T10:00:00.000Z',
    company_id: '00000000-0000-4000-a000-000000000001',
    period_start: '2025-04-01',
    period_end: '2025-04-07',
    total_shifts: 1,
    total_events: 3,
    total_hours: 8.0,
    hash_chain_integrity: 'VERIFIED',
    broken_chains: [],
    shifts: [
      {
        shift_id: 'a3f9b2c1-0000-4000-a000-000000000001',
        worker_name: 'Joao Ferreira',
        worker_employee_id: 'EH-001',
        site_name: 'Gungahlin Site',
        shift_date: '2025-04-07',
        start_time: '2025-04-06T21:00:00.000Z',
        end_time: '2025-04-07T05:30:00.000Z',
        break_minutes: 30,
        total_hours: 8.0,
        status: 'PAYROLL_APPROVED',
        receipt_id: 'FSTR-ABC12345',
        events: [
          {
            id: 'evt-001',
            company_id: '00000000-0000-4000-a000-000000000001',
            worker_id: '20000000-0000-4000-a000-000000000001',
            site_id: '10000000-0000-4000-a000-000000000001',
            event_type: 'START_SHIFT',
            event_data: { shift_id: 'a3f9b2c1-0000-4000-a000-000000000001' },
            device_metadata: {},
            event_hash: 'abc123',
            previous_event_hash: null,
            created_at: '2025-04-06T21:00:00.000Z',
            created_by: '20000000-0000-4000-a000-000000000001',
          },
        ],
        hash_chain_valid: true,
      },
    ],
    ...overrides,
  };
}

describe('renderAuditHtml', () => {
  it('produces valid HTML document', () => {
    const html = renderAuditHtml(makeAuditPack());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('contains Flostruction branding', () => {
    const html = renderAuditHtml(makeAuditPack());
    expect(html).toContain('Flostruction');
    expect(html).toContain('Audit Pack');
    expect(html).toContain('Every hour flows. Every pay right.');
  });

  it('shows period dates', () => {
    const html = renderAuditHtml(makeAuditPack());
    expect(html).toContain('2025-04-01');
    expect(html).toContain('2025-04-07');
  });

  it('shows shift data', () => {
    const html = renderAuditHtml(makeAuditPack());
    expect(html).toContain('Joao Ferreira');
    expect(html).toContain('EH-001');
    expect(html).toContain('Gungahlin Site');
    expect(html).toContain('8.00');
  });

  it('shows VERIFIED integrity', () => {
    const html = renderAuditHtml(makeAuditPack());
    expect(html).toContain('VERIFIED');
  });

  it('shows BROKEN integrity with details', () => {
    const html = renderAuditHtml(makeAuditPack({
      hash_chain_integrity: 'BROKEN',
      broken_chains: ['shift-123'],
    }));
    expect(html).toContain('BROKEN');
    expect(html).toContain('Hash Chain Integrity Failure');
    expect(html).toContain('shift-123');
  });

  it('includes event details when events present', () => {
    const html = renderAuditHtml(makeAuditPack());
    expect(html).toContain('START_SHIFT');
    expect(html).toContain('WLES Event Detail');
  });

  it('escapes HTML in worker names', () => {
    const pack = makeAuditPack();
    pack.shifts[0].worker_name = '<script>alert("xss")</script>';
    const html = renderAuditHtml(pack);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('includes receipt ID', () => {
    const html = renderAuditHtml(makeAuditPack());
    expect(html).toContain('FSTR-ABC12345');
  });

  it('shows summary statistics', () => {
    const html = renderAuditHtml(makeAuditPack({
      total_shifts: 5,
      total_events: 15,
      total_hours: 40.0,
    }));
    expect(html).toContain('5');
    expect(html).toContain('15');
    expect(html).toContain('40.00');
  });
});
