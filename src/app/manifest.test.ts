// W3 — manifest exposes the charcoal install tile at the right sizes/purposes,
// and the Apple touch icon renders to a valid PNG.

import { describe, it, expect } from 'vitest';
import manifest from './manifest';
import AppleIcon from './apple-icon';

describe('field PWA manifest icons', () => {
  const icons = manifest().icons ?? [];

  it('serves PNG install tiles at 192 and 512 (purpose any)', () => {
    const any = icons.filter((i) => i.purpose === 'any' && i.type === 'image/png');
    expect(any.map((i) => i.sizes).sort()).toEqual(['192x192', '512x512']);
    for (const i of any) expect(i.src).toMatch(/\/api\/pwa-icon\?size=/);
  });

  it('includes a maskable 512 tile (Android adaptive icon)', () => {
    const maskable = icons.find((i) => i.purpose === 'maskable' && i.type === 'image/png');
    expect(maskable).toBeDefined();
    expect(maskable?.sizes).toBe('512x512');
    expect(maskable?.src).toMatch(/maskable=1/);
  });

  it('keeps a scalable SVG fallback', () => {
    expect(icons.some((i) => i.type === 'image/svg+xml')).toBe(true);
  });

  it('install tile sits on the charcoal theme', () => {
    expect(manifest().theme_color).toBe('#0E1C2F');
  });
});

describe('apple touch icon', () => {
  it('renders a valid 180 PNG on the charcoal ground', async () => {
    const res = AppleIcon() as Response;
    expect(res.headers.get('content-type')).toContain('image/png');
    const buf = new Uint8Array(await res.arrayBuffer());
    expect([buf[0], buf[1], buf[2], buf[3]]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(buf.byteLength).toBeGreaterThan(1000);
  }, 20000);
});
