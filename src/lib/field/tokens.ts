// Flostruction Field — Design tokens
// ─────────────────────────────────────────────────────────────────────
// 2026-04-27 — REBASED ONTO v1 BRAND PALETTE (charcoal/cream/forest/amber/warmRed)
//
// Originally B3 colour semantics + B4 typography consolidation
// (navy/warm). This file used to BE the source of truth. As of
// 2026-04-27 it is a thin compatibility layer over the canonical
// v1 brand palette in `src/styles/brand-tokens.ts`.
//
// Why this shape (rather than a wholesale refactor of every
// consumer file from `palette.navy` → `brandPalette.charcoal`)?
//
//   - Substrate-discipline call. Every /field component imports
//     `palette.navy`, `palette.warm`, etc. from this file. Changing
//     the EXPORT VALUES here remaps the visual coat across all
//     8 consumer files simultaneously with zero per-file refactor.
//   - The semantic NAMES (navy, warm, amber, green, red, orange) are
//     retained as compatibility aliases. Each one is documented in
//     terms of the v1 palette role it now serves.
//   - Canonical v1 imports are still available via
//     `@/styles/brand-tokens` for any future code that wants the
//     authoritative names. This file is the consumer-facing surface
//     for /field screens.
//
// Mapping (locked 2026-04-27):
//   palette.navy           → brand.charcoal       (primary dark surface)
//   palette.navyTint       → brand.charcoal800    (charcoal panels/cards on dark bg)
//   palette.warm           → brand.cream          (primary light surface)
//   palette.warmTint       → brand.cream200       (subtle layering on light bg)
//   palette.warmTextOnNavy → cream alpha 0.92 on charcoal
//   palette.mutedOnNavy    → cream alpha 0.58 on charcoal
//   palette.border         → brand.cream300       (border on light bg)
//   palette.borderOnNavy   → cream alpha 0.16 on charcoal
//   palette.amber          → brand.amber          (live-action / pulsing dot)
//   palette.amberTint      → amber alpha 0.12
//   palette.green          → brand.forest         (sealed / confirmed)
//   palette.greenTint      → brand.forest100      (subtle success bg)
//   palette.red            → brand.warmRed        (destructive / flagged)
//   palette.redTint        → warmRed alpha 0.12
//   palette.orange         → brand.amber          (warning / awaiting — same accent as live)
//   palette.orangeTint     → amber alpha 0.12
//   palette.textPrimary    → brand.charcoal       (body text on light)
//   palette.textSecondary  → brand.charcoal500    (muted text on light)
//   palette.textTertiary   → brand.charcoal400    (faint text on light)
// ─────────────────────────────────────────────────────────────────────

import {
  brandPalette,
  brandShades,
  brandTypography,
} from '@/styles/brand-tokens';

export const palette = {
  /**
   * v1 colour semantics — every name is a compatibility alias
   * pointing at the canonical brand palette role:
   *
   *   navy   — primary dark surface (charcoal)
   *   warm   — primary light surface (cream)
   *   amber  — live-action / pulsing dot
   *   green  — sealed / confirmed (forest)
   *   red    — destructive / flagged (warmRed)
   *   orange — warning / awaiting action (same amber accent)
   */
  navy:               brandPalette.charcoal,        // #0F0F10
  navyTint:           brandShades.charcoal800,      // #1A1A1C
  warm:               brandPalette.cream,           // #F5F2EA
  warmTint:           brandShades.cream200,         // #EDE9DF
  warmTextOnNavy:     'rgba(245,242,234,0.92)',     // cream @ 92% on charcoal
  mutedOnNavy:        'rgba(245,242,234,0.58)',     // cream @ 58% on charcoal
  border:             brandShades.cream300,         // #E2DDD0 — borders on cream
  borderOnNavy:       'rgba(245,242,234,0.16)',     // cream @ 16% — borders on charcoal
  amber:              brandPalette.amber,           // #D9A548
  amberTint:          'rgba(217,165,72,0.12)',
  green:              brandPalette.forest,          // #2D5F3F
  greenTint:          brandShades.forest100,        // #E4F1E8
  greenText:          brandShades.forest700,        // #1F4A2E (deeper for contrast on cream)
  red:                brandPalette.warmRed,         // #C74B3A
  redTint:            'rgba(199,75,58,0.12)',
  orange:             brandPalette.amber,           // #D9A548 — same accent role
  orangeTint:         'rgba(217,165,72,0.12)',
  textPrimary:        brandPalette.charcoal,        // #0F0F10
  textSecondary:      brandShades.charcoal500,      // #55555C
  textTertiary:       brandShades.charcoal400,      // #7A7A82
} as const;

export const typography = {
  /**
   * Typography mapped onto v1 brand fonts (Archivo Narrow display
   * + Inter sans + JetBrains Mono per design-branch). Original
   * Source Serif Pro reference retained as fallback in `serif` for
   * receipt-card patterns; brand-tokens.ts owns the canonical set.
   *
   * Two families visible per screen:
   *   Receipt screen      — display + mono
   *   Home screen         — sans + mono (timestamps)
   *   Sign-in / onboarding — sans only
   */
  display: brandTypography.familyDisplay,
  // `serif` was the legacy receipt-card stack; receipts in v1 use the
  // display family (Archivo Narrow) for headline weight. Aliasing
  // `serif` → display preserves consumer code that reads `typography.serif`.
  serif:   brandTypography.familyDisplay,
  sans:    brandTypography.familyBody,
  mono:    brandTypography.familyMono,
} as const;

export const radius = {
  card:   '10px',
  button: '8px',
  pill:   '9999px',
} as const;

export const shadow = {
  card:      '0 1px 2px rgba(15,15,16,0.06), 0 4px 10px rgba(15,15,16,0.04)',
  cardHover: '0 2px 4px rgba(15,15,16,0.08), 0 8px 20px rgba(15,15,16,0.06)',
  modal:     '0 12px 32px rgba(15,15,16,0.18)',
} as const;

/**
 * Shift lifecycle UI states for the B1 state-driven home screen.
 * Exactly one is ever active at a time — the home page derives the
 * current state from /api/field/home-data and renders a single panel.
 */
export type FieldHomeState =
  | 'ONBOARDING' //  B6 first-login
  | 'NO_SHIFT_TODAY' //  State 1
  | 'IN_PROGRESS' //  State 2
  | 'AWAITING_CONFIRMATION'; //  State 3 — worker left geofence or tapped End Shift
