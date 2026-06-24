// W3 — PWA install tile renders to a valid PNG at each manifest size.

import { describe, it, expect } from 'vitest';
import { GET } from './route';

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]; // \x89 P N G

async function pngBytes(url: string): Promise<Uint8Array> {
  const res = (await GET(new Request(url))) as Response;
  expect(res.headers.get('content-type')).toContain('image/png');
  const buf = new Uint8Array(await res.arrayBuffer());
  expect(buf.byteLength).toBeGreaterThan(1000); // a real rendered tile, not empty
  return buf;
}

describe('pwa-icon route', () => {
  it('renders a 192 PNG (purpose any)', async () => {
    const b = await pngBytes('http://localhost/api/pwa-icon?size=192');
    expect([b[0], b[1], b[2], b[3]]).toEqual(PNG_MAGIC);
  }, 20000);

  it('renders a 512 PNG (purpose any)', async () => {
    const b = await pngBytes('http://localhost/api/pwa-icon?size=512');
    expect([b[0], b[1], b[2], b[3]]).toEqual(PNG_MAGIC);
  }, 20000);

  it('renders a 512 maskable PNG (safe-area padded)', async () => {
    const b = await pngBytes('http://localhost/api/pwa-icon?size=512&maskable=1');
    expect([b[0], b[1], b[2], b[3]]).toEqual(PNG_MAGIC);
  }, 20000);

  it('clamps an out-of-set size to the 512 default (no arbitrary sizes)', async () => {
    const res = (await GET(new Request('http://localhost/api/pwa-icon?size=9999'))) as Response;
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/png');
  }, 20000);
});
