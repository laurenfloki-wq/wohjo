// Browser-tab favicon — FLOSTRUCTION F-mark.
//
// Rendered at build time by Next.js via ImageResponse. Auto-injected
// into every page's <head> as <link rel="icon" type="image/png">.
// Replaces the prior default `src/app/favicon.ico` (Next.js placeholder).
//
// Geometry mirrors src/components/brand/FMark.tsx — extracted from
// brand suite v3 line 400. We can't import the React component
// directly into ImageResponse (it doesn't run client-side React in
// the icon route), so the F-shape is rendered as a flat <div> tree
// matching the same proportions.
//
// Variant: mono-navy at 32×32 — at small sizes, the green flow rails
// drop out for legibility per FMark's mono-navy variant rules. The
// background is brand cream (warm) so the navy F reads cleanly
// against light browser-chrome on every OS.

import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  // viewBox of FMark is 28×28; we render at the same proportions
  // inside a 32×32 canvas with a 2px border-frame of cream so the
  // navy strokes don't bleed to the tab edge.
  const NAVY = '#0E1C2F';
  const CREAM = '#F5F0E8';

  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          background: CREAM,
          display: 'flex',
        }}
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 28 28"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="3" y="3" width="7" height="22" rx="1" fill={NAVY} />
          <rect x="3" y="3" width="18" height="7" rx="1" fill={NAVY} />
          <rect x="3" y="13" width="14" height="6" rx="1" fill={NAVY} />
        </svg>
      </div>
    ),
    { ...size },
  );
}
