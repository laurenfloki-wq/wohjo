// Apple touch icon — FLOSTRUCTION Field PWA install tile for iOS home-screen.
//
// W3 (2026-06-25): the charcoal install tile. iOS uses this when a worker adds
// the /field PWA to their home screen, so it matches the source logo ground —
// the authoritative three-bar woven F-mark (three cream horizontals + three
// forest-green diagonals, public/brand/f-mark-three-bar.svg) on deep charcoal,
// the same tile the manifest serves via /api/pwa-icon. Next auto-injects this
// as <link rel="apple-touch-icon" sizes="180x180">.

import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  const CHARCOAL = '#0F0F10';
  const CREAM = '#F5F2EA';
  const GREEN = '#2D5F3F';

  return new ImageResponse(
    <div
      style={{
        width: 180,
        height: 180,
        background: CHARCOAL,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        width="132"
        height="132"
        viewBox="0 0 96 96"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Horizontal cream bars (base plane). */}
        <rect x="6" y="23" width="84" height="10" rx="1" fill={CREAM} />
        <rect x="6" y="43" width="84" height="10" rx="1" fill={CREAM} />
        <rect x="6" y="63" width="84" height="10" rx="1" fill={CREAM} />
        {/* Three forest-green diagonals leaning 18° about (48,48), over the bars. */}
        <rect x="30.5" y="5" width="7" height="86" fill={GREEN} transform="rotate(18 48 48)" />
        <rect x="44.5" y="5" width="7" height="86" fill={GREEN} transform="rotate(18 48 48)" />
        <rect x="58.5" y="5" width="7" height="86" fill={GREEN} transform="rotate(18 48 48)" />
      </svg>
    </div>,
    { ...size },
  );
}
