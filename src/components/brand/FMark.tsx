// FLOSTRUCTION F-mark — brand identity logo
//
// Geometry extracted verbatim from the canonical brand suite v3
// (~/Downloads/FLOSTRUCTION_Brand_Suite_v3.html line 400). Per the
// brand-suite description (line 394): "The F-mark is constructed
// from three rectangular strokes forming an F, with two green flow
// rails at precisely 20 degrees — reading simultaneously as the
// letter F, a verified checkmark in motion, and a construction form."
//
// IMPORTANT — substrate-DD note: this component is DISTINCT from
// `src/components/field/v1/FMark.tsx`, which is a decorative
// watermark pattern (three horizontal bars × three diagonal bars,
// 18° rotation, opacity 0.12) used on charcoal worker-app surfaces.
// That watermark stays as-is. This component is the brand-identity
// F-mark used on operator-facing surfaces (command nav, letterhead,
// favicon, business card) at full opacity. They are NOT
// interchangeable; pick the right one for the surface.
//
// Brand suite minimum size: 16px digital / 6mm print
// (brand suite v3 line 425). Default is 24px which suits nav usage.

import { type FC } from 'react';

export type FMarkColour = 'on-navy' | 'on-cream' | 'on-white' | 'mono-navy';
export type FMarkRails = 'full' | 'primary-only' | 'none';

interface FMarkProps {
  /** Render size in px (square). Default 24. Brand minimum 16. */
  size?: number;
  /** Tone variant. Picks the F-fill colour:
   *  - 'on-navy'    : white F + green-bright flow rails (canonical primary)
   *  - 'on-cream'   : navy F + green flow rails (secondary, on warm/cream)
   *  - 'on-white'   : navy F + green flow rails (paper / business card)
   *  - 'mono-navy'  : navy F, no flow rails (small icon contexts e.g. 16px) */
  colour?: FMarkColour;
  /** Flow-rail rendering — full = primary + secondary rail, primary-only =
   *  drop the smaller secondary rail (improves legibility under ~20px),
   *  none = no rails (mono variant). Default chosen from `colour`. */
  rails?: FMarkRails;
  /** Optional aria label. Decorative by default (aria-hidden). */
  label?: string;
}

const PALETTE_BY_COLOUR: Record<FMarkColour, { fStroke: string; rail: string }> = {
  'on-navy':   { fStroke: '#FFFFFF', rail: '#4ade80' }, // green-bright per brand suite line 15
  'on-cream':  { fStroke: '#0E1C2F', rail: '#166534' }, // navy + green per brand suite lines 10, 13
  'on-white':  { fStroke: '#0E1C2F', rail: '#166534' },
  'mono-navy': { fStroke: '#0E1C2F', rail: '#0E1C2F' }, // unused when rails === 'none'
};

const DEFAULT_RAILS_BY_COLOUR: Record<FMarkColour, FMarkRails> = {
  'on-navy':   'full',
  'on-cream':  'full',
  'on-white':  'full',
  'mono-navy': 'none',
};

export const FMark: FC<FMarkProps> = ({
  size = 24,
  colour = 'on-navy',
  rails,
  label,
}) => {
  const { fStroke, rail } = PALETTE_BY_COLOUR[colour];
  const effectiveRails = rails ?? DEFAULT_RAILS_BY_COLOUR[colour];

  // Geometry verbatim from brand suite v3 line 400. viewBox 28×28 with
  // border-radius 1 on each rect for the soft brand-suite corners.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      role={label ? 'img' : undefined}
      aria-hidden={label ? undefined : true}
      aria-label={label}
    >
      {/* F-shape — vertical stroke + top horizontal + middle horizontal */}
      <rect x="3" y="3" width="7" height="22" rx="1" fill={fStroke} />
      <rect x="3" y="3" width="18" height="7" rx="1" fill={fStroke} />
      <rect x="3" y="13" width="14" height="6" rx="1" fill={fStroke} />

      {/* Flow rails — two short rectangles rotated -20° from the right
          edge of the F-arms. Primary rail at the top arm; secondary
          rail (smaller, 65% opacity) at the middle arm. */}
      {effectiveRails === 'full' && (
        <>
          <rect
            x="15" y="8" width="9" height="3" rx="1"
            fill={rail}
            transform="rotate(-20 15 8)"
          />
          <rect
            x="16.5" y="16" width="6.5" height="2" rx="1"
            fill={rail}
            opacity="0.65"
            transform="rotate(-20 16.5 16)"
          />
        </>
      )}
      {effectiveRails === 'primary-only' && (
        <rect
          x="15" y="8" width="9" height="3" rx="1"
          fill={rail}
          transform="rotate(-20 15 8)"
        />
      )}
    </svg>
  );
};
