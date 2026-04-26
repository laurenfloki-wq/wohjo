// Worker app v1 — brand font imports.
// ─────────────────────────────────────────────────────────────────────
// DORMANT UNTIL POST-ACTIVATION MERGE.
// This file is NOT imported by src/app/layout.tsx yet. Importing it
// into the RootLayout is a conscious act that wires the new fonts
// into the rendered <html> class and begins paying their
// build-time / runtime cost. Scheduled for post-activation merge
// (target: Thursday 30 April 2026 onward).
//
// Three font families used by the v1 worker-app design:
//
//   • Archivo Narrow  — display, screen headings, receipt-card
//                       primary metrics. NEW for v1 — requires
//                       wiring into layout.tsx on merge.
//   • Inter           — body text, labels, buttons. ALREADY loaded
//                       by the existing layout.tsx (Day 6 PWA
//                       typography consolidation). Re-exported here
//                       for single-source-of-truth in the v1 design
//                       system.
//   • JetBrains Mono  — hash strings, receipt IDs, timestamps,
//                       technical metadata. ALREADY loaded by the
//                       existing layout.tsx. Re-exported here.
//
// All three fonts are served by Google Fonts via next/font/google,
// which means they're downloaded once at build time and served
// self-hosted from the app's own origin. No runtime calls to
// fonts.googleapis.com.
//
// Post-activation merge steps (for future reference):
//
//   1. In src/app/layout.tsx:
//      a. Import the `archivoNarrow` binding from this file.
//      b. Add `archivoNarrow.variable` to the <html className={...}>
//         string alongside the existing font variables.
//   2. That's it — the CSS variable `--font-archivo-narrow` becomes
//      available to any component that references it via the
//      brandTypography.familyDisplay token.
//
// Until step 1 is performed, this file's imports have zero runtime
// effect. The fonts are not downloaded. The CSS variables are not
// emitted. The worker-app screens continue rendering with the
// pre-v1 typography from `src/lib/field/tokens.ts`.
// ─────────────────────────────────────────────────────────────────────

import { Archivo_Narrow, Inter, JetBrains_Mono } from 'next/font/google';

/**
 * Archivo Narrow — display + screen headings.
 * NEW for v1. Downloaded at build time on first import into layout.
 * Variable is referenced from brandTypography.familyDisplay.
 */
export const archivoNarrow = Archivo_Narrow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-archivo-narrow',
  display: 'swap',
});

/**
 * Inter — body, labels, buttons.
 * Already loaded by src/app/layout.tsx. Re-exported here so the v1
 * design system has a single authoritative handle on every font
 * it uses. Importing this from this file is equivalent to importing
 * it directly in layout.tsx — next/font/google deduplicates.
 */
export const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

/**
 * JetBrains Mono — hashes, receipt IDs, timestamps.
 * Already loaded by src/app/layout.tsx. Re-exported for the same
 * single-source-of-truth reason as inter.
 */
export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

/**
 * Combined class-name builder — pass this to the <html> tag's
 * className on post-activation merge. Equivalent to:
 *   `${archivoNarrow.variable} ${inter.variable} ${jetbrainsMono.variable}`
 */
export const brandFontVariables = [
  archivoNarrow.variable,
  inter.variable,
  jetbrainsMono.variable,
].join(' ');

// NOTE: the existing layout.tsx already adds inter.variable and
// jetbrainsMono.variable (under different const names — `inter` and
// `jetbrainsMono` locally in that file). At merge time, layout.tsx
// can either:
//   (a) import `brandFontVariables` from this file and use it
//       directly (simplest), dropping the local font declarations,
//       OR
//   (b) add only `archivoNarrow.variable` from this file alongside
//       the existing Inter + JetBrainsMono locals (minimal churn).
// Both paths achieve the same result; (a) is cleaner for long-term
// maintenance, (b) is the smaller diff on merge day.
