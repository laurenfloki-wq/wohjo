// In-browser verifier parity — the WebCrypto hashing path used by
// /wles/verifier must produce byte-identical seals to the production
// Node path (v1.hashEvent), and the embedded demo chain must verify.
// Audit 2026-07-02.

import { describe, it, expect } from 'vitest';
import { webcrypto } from 'node:crypto';
import { hashEvent, verifyChain } from './v1';
import { canonicaliseEvent } from './v1-canonical';
import { ZERO_HASH, type WlesEventUnsealed } from './v1-types';
import { SAMPLE_CHAIN } from '../../components/wles/verifier-sample';

async function webCryptoSha256Hex(s: string): Promise<string> {
  const buf = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const CASES: WlesEventUnsealed[] = [
  {
    actor_id: 'worker-1',
    event_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    event_type: 'CLOCK_IN',
    payload: { site_id: 's1', note: 'unicode — tick ✓ and emoji 🙂', hours: '7.25' },
    previous_event_hash: ZERO_HASH,
    subject_id: 'shift-1',
    timestamp: '2026-07-01T07:00:00+10:00',
  },
  {
    actor_id: 'supervisor-1',
    event_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    event_type: 'APPROVAL',
    payload: { nested: { z: 1, a: [true, null, 'x'] } },
    metadata: { 'x-flos-demo': 'yes' },
    previous_event_hash: ZERO_HASH,
    subject_id: 'shift-1',
    timestamp: '2026-07-01T15:00:00+10:00',
  },
];

describe('in-browser verifier parity (WLES v1.0 §5/§6)', () => {
  it('WebCrypto SHA-256 over the shared canonicalisation equals hashEvent', async () => {
    for (const ev of CASES) {
      const server = hashEvent(ev);
      const browser = await webCryptoSha256Hex(canonicaliseEvent(ev));
      expect(browser).toBe(server);
    }
  });

  it('the embedded verifier sample chain verifies against production code', () => {
    const result = verifyChain(SAMPLE_CHAIN);
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.events_scanned).toBe(SAMPLE_CHAIN.length);
  });
});
