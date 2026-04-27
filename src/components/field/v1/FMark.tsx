// v1 visual coat — F-mark watermark component.
// Inline SVG mirror of public/brand/f-mark-three-bar.svg — three
// horizontal bars × three diagonal bars, woven, 18° rotation.
// Used as a watermark on charcoal surfaces (live-shift card, receipt
// card, supervisor-pending state). Decorative only — pointer-events:
// none — never interferes with adjacent tap targets.
//
// Optional `breathing` prop animates opacity 0.08 → 0.14 over 4s
// ease-in-out (the supervisor-pending "waiting" affordance).
// Respects `prefers-reduced-motion: reduce` — pins to 0.10 static.

'use client';

import { type CSSProperties, type FC } from 'react';
import { palette } from '@/lib/field/tokens';

interface FMarkProps {
  /** Surface tone — 'cream' draws cream bars on a charcoal background;
   *  'forest' draws forest bars on a cream background. */
  tone?: 'cream' | 'forest';
  /** Watermark size in px. Default 96 per design-branch spec. */
  size?: number;
  /** Static opacity (0..1). Ignored when `breathing` is true. */
  opacity?: number;
  /** Enable the supervisor-pending breathing animation. */
  breathing?: boolean;
  /** Position; default 'absolute bottom-right'. Set 'inline' to render
   *  inline (e.g., header bug) without absolute positioning. */
  placement?: 'bottom-right' | 'top-right' | 'inline';
  /** Extra style overrides — applied last. */
  style?: CSSProperties;
}

const FILL = {
  cream:  palette.warm,    // #F5F2EA — bars on charcoal surface
  forest: palette.green,   // #2D5F3F — bars on cream surface
} as const;

const placementStyles: Record<NonNullable<FMarkProps['placement']>, CSSProperties> = {
  'bottom-right': { position: 'absolute', bottom: 20, right: 20 },
  'top-right':    { position: 'absolute', top: 20,    right: 20 },
  'inline':       { position: 'relative' },
};

export const FMark: FC<FMarkProps> = ({
  tone = 'cream',
  size = 96,
  opacity = 0.12,
  breathing = false,
  placement = 'bottom-right',
  style,
}) => {
  const fill = FILL[tone];
  const baseStyle: CSSProperties = {
    ...placementStyles[placement],
    width: size,
    height: size,
    color: fill,
    opacity: breathing ? undefined : opacity,
    pointerEvents: 'none',
    animation: breathing ? 'fmark-breathe 4s ease-in-out infinite' : undefined,
    ...style,
  };

  return (
    <svg
      viewBox="0 0 96 96"
      style={baseStyle}
      aria-hidden="true"
      // Authoritative geometry — three horizontal bars at y={23,43,63}
      // height 10 over three diagonal bars rotated 18° about (48,48).
      // Mirror of public/brand/f-mark-three-bar.svg.
    >
      <g transform="rotate(18 48 48)">
        <rect x="6" y="23" width="84" height="10" fill={fill} />
        <rect x="6" y="43" width="84" height="10" fill={fill} />
        <rect x="6" y="63" width="84" height="10" fill={fill} />
      </g>
      <rect x="6" y="23" width="84" height="10" fill={fill} />
      <rect x="6" y="43" width="84" height="10" fill={fill} />
      <rect x="6" y="63" width="84" height="10" fill={fill} />
    </svg>
  );
};

/**
 * Global styles for FMark. Inject once at the app shell (or in
 * globals.css) — mounted here as a styled-jsx fallback so consumers
 * who use just <FMark /> don't have to remember to import the
 * keyframes separately.
 *
 * NB: Next.js will hoist this at build time; idempotent across
 * multiple FMark instances on the same page.
 */
export const FMarkKeyframes: FC = () => (
  <style jsx global>{`
    @keyframes fmark-breathe {
      0%, 100% { opacity: 0.08; }
      50%      { opacity: 0.14; }
    }
    @media (prefers-reduced-motion: reduce) {
      [style*="fmark-breathe"] {
        animation: none !important;
        opacity: 0.10 !important;
      }
    }
  `}</style>
);
