// M4-J — public verify surface tests.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { serviceMock } = vi.hoisted(() => ({
  serviceMock: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn(() => serviceMock),
}));

vi.mock('@/lib/logger', () => ({
  routeLogger: vi.fn(() => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn(),
  })),
}));

import { GET } from './route';

const SAMPLE_FP = 'c'.repeat(64);
const MALFORMED_FP = 'not-a-real-fingerprint';

function buildPackRow() {
  return {
    id: 'pk-1',
    pack_fingerprint: SAMPLE_FP,
    generated_at: '2026-06-06T10:30:00.000Z',
    audit_pack_storage_path: 'company/period/pack-...pdf',
    canonical_manifest_jsonb: {
      bridge_event_hash: 'ec801f17',
      v1_chain_tip_hash: 'cafebabe',
      frozen_anchor: {
        id: 'FROZEN_ANCHOR_V0',
        fingerprint: '8e6d4af90792eadb47f9205fe18e6325',
        count: 32,
        formula: 'md5(...)',
        bound_at: '2026-06-04T02:56:50Z',
        scope: 'spec=0 pre cutover',
      },
      shifts: [
        {
          event_chain_segment: [
            { event_hash: 'h1', previous_event_hash: 'h0' },
            { event_hash: 'h2', previous_event_hash: 'h1' },
          ],
        },
      ],
    },
  };
}

function setupMock(opts: { hit: boolean; broken?: number }) {
  serviceMock.from.mockReset();
  serviceMock.rpc.mockReset();
  serviceMock.from.mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: vi.fn().mockResolvedValue({
          data: opts.hit ? buildPackRow() : null,
          error: null,
        }),
      }),
    }),
  });
  serviceMock.rpc.mockResolvedValue({ data: opts.broken ?? 0, error: null });
}

function params(fp: string) {
  return { params: Promise.resolve({ fingerprint: fp }) };
}

describe('GET /verify/pack/:fingerprint', () => {
  beforeEach(() => {
    serviceMock.from.mockReset();
    serviceMock.rpc.mockReset();
  });

  it('returns 404 with the not_found body for a malformed fingerprint', async () => {
    setupMock({ hit: false });
    const res = await GET(new Request('http://test/'), params(MALFORMED_FP));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'not_found' });
  });

  it('returns 404 with the SAME body for a well-formed but unknown fingerprint', async () => {
    setupMock({ hit: false });
    const res = await GET(new Request('http://test/'), params(SAMPLE_FP));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'not_found' });
  });

  it('returns the inclusion proof on hit and never leaks event_type / spec_version', async () => {
    setupMock({ hit: true });
    const res = await GET(new Request('http://test/'), params(SAMPLE_FP));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.pack_fingerprint).toBe(SAMPLE_FP);
    expect(body.exists).toBe(true);
    expect(body.spec_version).toBe('1.0');
    // generated_at coarsened to YYYY-MM-DD
    expect(body.generated_at_date).toBe('2026-06-06');

    // Inclusion proof shape
    expect(body.inclusion_proof.anchor.fingerprint).toBe('8e6d4af90792eadb47f9205fe18e6325');
    expect(body.inclusion_proof.bridge_event_hash).toBe('ec801f17');
    expect(body.inclusion_proof.chain_tip_at_pack).toBe('cafebabe');
    expect(body.inclusion_proof.event_chain_segment).toEqual([
      { event_hash: 'h1', previous_event_hash: 'h0' },
      { event_hash: 'h2', previous_event_hash: 'h1' },
    ]);

    // PII / shape strip enforced
    const flat = JSON.stringify(body);
    expect(flat).not.toContain('event_type');
    expect(flat).not.toContain('worker');
    expect(flat).not.toContain('total_hours');
    expect(flat).not.toContain('pack_summary');
    expect(flat).not.toContain('pay_period');
    expect(flat).not.toContain('receipt_id');

    expect(body.chain_integrity_at_verification).toBe('intact');
  });

  it('marks integrity broken when count_broken_chain_links() > 0', async () => {
    setupMock({ hit: true, broken: 1 });
    const res = await GET(new Request('http://test/'), params(SAMPLE_FP));
    const body = await res.json();
    expect(body.chain_integrity_at_verification).toBe('broken');
  });
});
