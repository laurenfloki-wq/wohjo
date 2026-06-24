// Workstream 3 — FLOSTRUCTION Field PWA install tile (charcoal ground).
//
// Renders the authoritative three-bar woven F-mark (three cream horizontal
// bars + three forest-green diagonal bars) on the deep-charcoal display field
// the source logo uses — the same mark as public/brand/f-mark-three-bar.svg,
// itself rebuilt from the source JPGs. Served as PNG via ImageResponse at a
// stable URL so the manifest icons[] can point at real raster sizes.
//
// Query params:
//   size      192 | 512  (square canvas; defaults 512, clamped)
//   maskable  '1'         (Android adaptive-icon: shrink the mark into the
//                          central safe area so the OS mask never clips it)

import { ImageResponse } from 'next/og';

export const contentType = 'image/png';

const CHARCOAL = '#0F0F10'; // the source logo ground
const CREAM = '#F5F2EA';
const GREEN = '#2D5F3F';

const ALLOWED = new Set([192, 512]);

export function GET(request: Request) {
  const url = new URL(request.url);
  const sizeParam = Number(url.searchParams.get('size'));
  const size = ALLOWED.has(sizeParam) ? sizeParam : 512;
  const maskable = url.searchParams.get('maskable') === '1';

  // 'any' fills most of the tile; maskable shrinks into the ~60% safe zone so
  // Android's circular/squircle mask can't clip the diagonals.
  const markFraction = maskable ? 0.58 : 0.78;
  const markPx = Math.round(size * markFraction);

  return new ImageResponse(
    <div
      style={{
        width: size,
        height: size,
        background: CHARCOAL,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        width={markPx}
        height={markPx}
        viewBox="0 0 96 96"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Horizontal cream bars (base plane). */}
        <rect x="6" y="23" width="84" height="10" rx="1" fill={CREAM} />
        <rect x="6" y="43" width="84" height="10" rx="1" fill={CREAM} />
        <rect x="6" y="63" width="84" height="10" rx="1" fill={CREAM} />
        {/* Three forest-green diagonals, leaning 18° about the centre (48,48),
              drawn over the horizontals. Per-rect rotate (Satori-safe). */}
        <rect x="30.5" y="5" width="7" height="86" fill={GREEN} transform="rotate(18 48 48)" />
        <rect x="44.5" y="5" width="7" height="86" fill={GREEN} transform="rotate(18 48 48)" />
        <rect x="58.5" y="5" width="7" height="86" fill={GREEN} transform="rotate(18 48 48)" />
      </svg>
    </div>,
    { width: size, height: size },
  );
}
