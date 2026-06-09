// FLOSTRUCTION marketing mark — flostruction-v5.html:499 (inline SVG).
// Three cream horizontal bars crossed by three forest diagonals at the
// canonical 18 degrees, viewBox 96x96.
//
// FMark reconciliation (brief, Substrate-DD item 3): this geometry is
// DISTINCT from the shared brand-identity F-mark
// (src/components/brand/FMark.tsx — F-letterform with -20 degree flow
// rails). The conflict was surfaced to Lauren on 2026-06-10 and she
// chose the prototype mark as-is for the marketing devices. The brand
// FMark component is untouched.
import { type FC } from 'react';

interface FMarkBarsProps {
  /** Extra class names — the prototype uses fmk ghost / fmk-app /
   *  fmk-av / fmk-side for sizing (see marketing.css). */
  className?: string;
  /** Bar colour. Prototype: cream #F5F3EE on navy surfaces. */
  bar?: string;
  /** Diagonal rail colour. Prototype: green display variant #1E7A40. */
  rail?: string;
}

export const FMarkBars: FC<FMarkBarsProps> = ({
  className,
  bar = '#F5F3EE',
  rail = '#1E7A40',
}) => (
  <svg className={className} viewBox="0 0 96 96" aria-hidden="true">
    <rect x="6" y="23" width="84" height="10" fill={bar} />
    <rect x="6" y="43" width="84" height="10" fill={bar} />
    <rect x="6" y="63" width="84" height="10" fill={bar} />
    <g transform="rotate(18 48 48)">
      <rect x="30.5" y="5" width="7" height="86" fill={rail} />
      <rect x="44.5" y="5" width="7" height="86" fill={rail} />
      <rect x="58.5" y="5" width="7" height="86" fill={rail} />
    </g>
  </svg>
);
