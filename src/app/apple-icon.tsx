// Apple touch icon — FLOSTRUCTION F-mark for iOS home-screen install.
//
// Rendered at build time by Next.js via ImageResponse. Auto-injected
// as <link rel="apple-touch-icon" sizes="180x180">. iOS uses this when
// the user adds flostruction.com or the /field PWA to home screen.
//
// Variant: on-cream at 180×180. At this size the green flow rails
// render cleanly, so we use the full F-mark with both rails (matches
// the brand-suite v3 canonical primary). Cream background per the
// brand-identity letterhead pattern.

import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  const NAVY = '#0E1C2F';
  const GREEN = '#166534';
  const CREAM = '#F5F0E8';

  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: CREAM,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          width="140"
          height="140"
          viewBox="0 0 28 28"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* F-shape — vertical + top + middle horizontal strokes */}
          <rect x="3" y="3" width="7" height="22" rx="1" fill={NAVY} />
          <rect x="3" y="3" width="18" height="7" rx="1" fill={NAVY} />
          <rect x="3" y="13" width="14" height="6" rx="1" fill={NAVY} />
          {/* Flow rails — primary at top arm, secondary at middle */}
          <rect
            x="15" y="8" width="9" height="3" rx="1"
            fill={GREEN}
            transform="rotate(-20 15 8)"
          />
          <rect
            x="16.5" y="16" width="6.5" height="2" rx="1"
            fill={GREEN}
            opacity="0.65"
            transform="rotate(-20 16.5 16)"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
