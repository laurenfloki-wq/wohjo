// Centralised GSAP plugin registration for the marketing surface.
//
// Per the motion brief §3:
//   - Library is gsap + @gsap/react. Single, centralised plugin-registration
//     module. No second animation engine on this render surface.
//   - 'use client' only on components that actually animate. This module is
//     client-only because gsap touches the DOM at import time.
//   - All consumers go through useGSAP() (from @gsap/react) for lifecycle.
//
// Plugins registered here:
//   - ScrollTrigger    — scroll-linked work (parallax, scrub, scroll-spy)
//   - SplitText        — headline line-mask reveals
//   - ScrambleTextPlugin — SHA-256 hash scramble-resolve on the receipt
//
// Not registered: DrawSVGPlugin, Flip, ScrollSmoother. Those are Phase 3 /
// follow-up scope; keeping the bundle tight until they earn their weight.
//
// The matchMedia tier conditions are colocated here so every consumer
// references the same three queries — full / mobile / reduced.

'use client';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';

let registered = false;

if (typeof window !== 'undefined' && !registered) {
  gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin);
  registered = true;
  // Verification handle — read-only from app code. Exposed so the
  // §9 cleanup test can call `ScrollTrigger.getAll().length` across
  // route changes and prove no orphans accumulate. Tiny surface
  // (two already-bundled refs); does not constitute a public API.
  (window as unknown as { __motion?: unknown }).__motion = {
    gsap,
    ScrollTrigger,
  };
}

export { gsap, ScrollTrigger, SplitText, ScrambleTextPlugin };

// Three matchMedia tiers. Every motion block on the marketing surface
// must be wrapped in gsap.matchMedia() using exactly these keys so the
// reduced-motion tier is guaranteed coverage.
//
// `full`    — desktop, no reduced-motion. The full choreography.
// `mobile`  — phone width, no reduced-motion. Simplified — no pin, no
//             parallax, in-view reveals only.
// `reduced` — prefers-reduced-motion: reduce (any breakpoint). Final
//             states only. Same information conveyed statically.
export const MM = {
  full:    '(min-width: 768px) and (prefers-reduced-motion: no-preference)',
  mobile:  '(max-width: 767px) and (prefers-reduced-motion: no-preference)',
  reduced: '(prefers-reduced-motion: reduce)',
} as const;
