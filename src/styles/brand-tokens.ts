// Worker app v1 — brand tokens.
// ─────────────────────────────────────────────────────────────────────
// DORMANT UNTIL POST-ACTIVATION MERGE.
// This file is NOT imported by any screen component yet. Foundation
// work only, per compressed-path direction 2026-04-24. It exists
// as the single source of truth for the v1 design language that
// will be applied to /field screens post-activation (target:
// Tuesday 28 April 2026 EOD activation → design merge from
// Thursday 30 April onward).
//
// Current /field screens continue to use `src/lib/field/tokens.ts`
// (the pre-v1 navy/warm tokens) until explicitly switched over.
// ─────────────────────────────────────────────────────────────────────
//
// Palette approved by both founders 2026-04-24 per mockups:
//   deep charcoal  #0F0F10  primary dark surface
//   cream          #F5F2EA  primary light surface
//   forest green   #2D5F3F  positive / confirmation accent
//   amber          #D9A548  live-action accent, pulsing dot
//   warm red       #C74B3A  error / flagged / stop-action
//
// Auxiliary shades below are Cowork-derived from the primary five,
// pending mockup-level confirmation by founders. Flag any shade
// that doesn't match the approved mockups and Cowork will revise.

// ─── PRIMARY PALETTE ────────────────────────────────────────────────

export const brandPalette = {
  /** Primary dark surface — backgrounds, panels, deep headers. */
  charcoal: '#0F0F10',
  /** Primary light surface — cream field, cards, receipts. */
  cream: '#F5F2EA',
  /** Positive / confirmation accent — seal moments, "confirmed". */
  forest: '#2D5F3F',
  /** Live-action accent — pulsing dot, in-progress indicator, amber highlights. */
  amber: '#D9A548',
  /** Error / flagged / stop-action accent — warnings and destructive moments. */
  warmRed: '#C74B3A',
} as const;

// ─── AUXILIARY SHADES (Cowork-derived, pending founder confirmation) ─

export const brandShades = {
  // Charcoal ramp — neutral darks for text, subtle surfaces on charcoal bg.
  charcoal950: '#070708',
  charcoal900: '#0F0F10',    // = primary charcoal
  charcoal800: '#1A1A1C',
  charcoal700: '#26262A',
  charcoal600: '#3A3A40',
  charcoal500: '#55555C',
  charcoal400: '#7A7A82',
  charcoal300: '#A3A3A8',
  charcoal200: '#CECED2',
  charcoal100: '#E7E7E9',
  charcoal50:  '#F4F4F5',

  // Cream ramp — warm off-whites for layering on light surfaces.
  cream100: '#F5F2EA',       // = primary cream
  cream200: '#EDE9DF',
  cream300: '#E2DDD0',
  cream400: '#D3CCBD',

  // Forest ramp — positive states at different intensities.
  forest700: '#1F4A2E',
  forest600: '#2D5F3F',      // = primary forest
  forest500: '#3C7950',
  forest400: '#5F9A72',
  forest200: '#BCD9C3',
  forest100: '#E4F1E8',       // subtle success background tint
  forest50:  '#F2F8F3',

  // Amber ramp — live-action intensities + pulse-opacity.
  amber700: '#B48630',
  amber600: '#D9A548',       // = primary amber
  amber500: '#E3B668',
  amber400: '#EFCA8E',
  amber100: '#FAEBCF',
  amber50:  '#FDF6E6',
  amberPulseA: 'rgba(217, 165, 72, 0.90)',  // pulsing dot — high state
  amberPulseB: 'rgba(217, 165, 72, 0.30)',  // pulsing dot — low state

  // Warm red ramp — warning / error intensities.
  warmRed700: '#A0371F',
  warmRed600: '#C74B3A',     // = primary warm red
  warmRed500: '#D9664D',
  warmRed400: '#E89580',
  warmRed100: '#F8D7CE',
  warmRed50:  '#FDEDE7',
} as const;

// ─── SEMANTIC ROLES ─────────────────────────────────────────────────
// Map primary purposes to palette members so screens don't hardcode
// charcoal/cream directly — they reference role names. This permits
// future theme variants (e.g., dark-mode, high-contrast) without
// rewriting screens.

export const brandRoles = {
  // Surfaces
  surfaceDark:        brandPalette.charcoal,
  surfaceLight:       brandPalette.cream,
  surfaceCardOnLight: '#FFFFFF',
  surfaceCardOnDark:  brandShades.charcoal800,
  surfaceDivider:     brandShades.charcoal200,
  surfaceDividerDark: brandShades.charcoal700,

  // Text
  textOnLight:         brandShades.charcoal900,
  textOnLightMuted:    brandShades.charcoal500,
  textOnLightFaint:    brandShades.charcoal400,
  textOnDark:          brandPalette.cream,
  textOnDarkMuted:     'rgba(245,242,234,0.70)',
  textOnDarkFaint:     'rgba(245,242,234,0.45)',

  // Accents — each has a canonical role
  accentPositive:      brandPalette.forest,
  accentPositiveSoft:  brandShades.forest100,
  accentLive:          brandPalette.amber,
  accentLiveSoft:      brandShades.amber100,
  accentDanger:        brandPalette.warmRed,
  accentDangerSoft:    brandShades.warmRed100,

  // Shift-lifecycle state colours
  shiftIdle:           brandShades.charcoal200,
  shiftInProgress:     brandPalette.amber,
  shiftSealed:         brandPalette.forest,
  shiftFlagged:        brandPalette.warmRed,
} as const;

// ─── TYPOGRAPHY SCALE ───────────────────────────────────────────────
// Cowork-inferred nine-step scale matching typical worker-app density.
// Confirm against the six approved mockups (shift list home, confirm
// arrival, shift in progress, confirm departure, seal moment, receipt
// card) and revise if any size differs.

export const brandTypography = {
  // Font-family tokens — pair with brand-fonts.ts variable references.
  familyDisplay: "var(--font-archivo-narrow), 'Inter', system-ui, sans-serif",
  familyBody:    "var(--font-inter), 'Inter', system-ui, sans-serif",
  familyMono:    "var(--font-jetbrains-mono), 'SF Mono', 'JetBrains Mono', ui-monospace, monospace",

  // Size / line-height scale. All sizes in pixels at base 16.
  size: {
    displayXL:   '32px',   // seal-moment headline
    displayLG:   '28px',   // receipt-card primary (workers' name / hours)
    displayMD:   '24px',   // screen titles
    headingLG:   '20px',   // section headings
    headingMD:   '18px',   // card titles
    bodyLG:      '16px',   // primary body
    bodyMD:      '14px',   // secondary body
    bodySM:      '12px',   // labels, captions
    metadata:    '11px',   // timestamps on cards
  },
  leading: {
    tight:   '1.15',   // display sizes
    snug:    '1.25',   // headings
    normal:  '1.45',   // body
    relaxed: '1.55',   // longer-form body
  },
  weight: {
    regular: 400,
    medium:  500,
    semibold: 600,
    bold:     700,
  },
  tracking: {
    tight:   '-0.01em',   // display
    normal:  '0',
    wide:    '0.04em',    // uppercase labels
    wider:   '0.08em',    // "verified" / "sealed" micro-labels
  },
} as const;

// ─── SPACING SCALE ──────────────────────────────────────────────────
// 4px base unit; 8-step scale. All screen-level margins, card paddings,
// and inter-element gaps draw from here.

export const brandSpacing = {
  xxs: '4px',
  xs:  '8px',
  sm:  '12px',
  md:  '16px',
  lg:  '24px',
  xl:  '32px',
  xxl: '48px',
  xxxl:'64px',
} as const;

// ─── RADII ──────────────────────────────────────────────────────────

export const brandRadii = {
  none:    '0',
  sm:      '4px',
  md:      '8px',
  lg:      '12px',     // primary card radius
  xl:      '20px',     // hero surfaces
  pill:    '9999px',   // pulsing-dot container
} as const;

// ─── ELEVATION / SHADOW ─────────────────────────────────────────────

export const brandShadow = {
  // On cream/light surfaces
  card:       '0 1px 2px rgba(15,15,16,0.06), 0 4px 10px rgba(15,15,16,0.04)',
  cardHover:  '0 2px 4px rgba(15,15,16,0.08), 0 8px 20px rgba(15,15,16,0.06)',
  modal:      '0 12px 32px rgba(15,15,16,0.18)',
  // On charcoal/dark surfaces — subtle warm lifts
  cardDark:   '0 1px 2px rgba(0,0,0,0.40), 0 4px 14px rgba(0,0,0,0.20)',
} as const;

// ─── MOTION TOKENS ─────────────────────────────────────────────────
// Pulsing amber dot, seal-moment animation, card hover, state
// transitions. Referenced from CSS @keyframes in component CSS.

export const brandMotion = {
  pulseDuration:         '1.8s',    // pulsing amber dot cycle
  pulseEasing:           'cubic-bezier(0.4, 0, 0.6, 1)',
  sealDuration:          '720ms',   // seal-moment reveal
  sealEasing:            'cubic-bezier(0.22, 1, 0.36, 1)',
  cardPress:             '120ms cubic-bezier(0.4, 0, 0.2, 1)',
  crossfade:             '240ms ease-out',
} as const;

// ─── Z-INDEX ───────────────────────────────────────────────────────

export const brandZ = {
  base:   0,
  card:   10,
  header: 100,
  modal:  1000,
  toast:  1100,
} as const;

// ─── COMPONENT-SPECIFIC TOKENS (drawn from the six approved mockups) ─
// These are declarative specs that screen components reference when
// the v1 visual merge happens post-activation. Each is keyed to the
// element it styles.

export const brandComponents = {
  /**
   * Receipt card — the hero printed-ticket pattern. Two serrated edges
   * at top and bottom rendered via inline SVG (no bitmap). Dimensions
   * and colours below are the source of truth for the component.
   */
  receiptCard: {
    background:          brandRoles.surfaceCardOnLight,
    foreground:          brandRoles.textOnLight,
    borderColour:        brandShades.charcoal200,
    borderRadius:        brandRadii.lg,
    paddingBlock:        brandSpacing.lg,
    paddingInline:       brandSpacing.lg,
    shadow:              brandShadow.card,
    serrationDiameter:   '12px',     // semi-circular notches
    serrationStride:     '20px',     // distance between notch centres
    serrationColourFg:   brandRoles.surfaceCardOnLight,
    serrationColourBg:   brandRoles.surfaceLight,    // the surface behind the card
  },
  /**
   * Live shift card — the in-progress shift tile. Watermark three-bar
   * mark (the FLOSTRUCTION "F-mark" at 12% opacity) sits inside the
   * card to denote active sealing.
   *
   * Asset path: `/brand/f-mark-three-bar.svg` under public/, served
   * at `/brand/f-mark-three-bar.svg` at runtime. Import with
   * `<Image src="/brand/f-mark-three-bar.svg" ...>` or inline via
   * Next.js `next/image` at merge day.
   */
  liveShiftCard: {
    background:              brandPalette.charcoal,
    foreground:              brandPalette.cream,
    watermarkMark:           '/brand/f-mark-three-bar.svg',
    watermarkOpacity:        0.12,
    watermarkSize:           '96px',
    pulseDotColour:          brandPalette.amber,
    pulseDotSize:            '10px',
    pulseDotAnimationName:   'liveShiftPulse',
  },
  /**
   * Seal moment — the full-bleed confirmation screen shown post-
   * clock-out, before the receipt card materialises.
   */
  sealMoment: {
    background:            brandPalette.forest,
    foreground:            brandPalette.cream,
    iconSize:              '72px',
    displayFontSize:       brandTypography.size.displayXL,
    transitionEnterMs:     720,
    transitionExitMs:      480,
  },
} as const;

// ─── KEYFRAME DEFINITIONS (to be @-injected post-activation) ────────
// Exported as strings so components can inject the needed
// animations at mount. These are not active until screens import
// and apply them post-activation.

export const brandKeyframes = {
  liveShiftPulse: `
    @keyframes liveShiftPulse {
      0%, 100% { opacity: 0.90; transform: scale(1); }
      50%      { opacity: 0.30; transform: scale(0.85); }
    }
  `,
  sealReveal: `
    @keyframes sealReveal {
      0%   { opacity: 0; transform: translateY(12px) scale(0.985); }
      60%  { opacity: 1; transform: translateY(0) scale(1.01); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }
  `,
} as const;

// ─── EXPORT SURFACE ─────────────────────────────────────────────────
// Single default export for ergonomic imports, plus named exports
// for selective imports.

const brandTokens = {
  palette:    brandPalette,
  shades:     brandShades,
  roles:      brandRoles,
  typography: brandTypography,
  spacing:    brandSpacing,
  radii:      brandRadii,
  shadow:     brandShadow,
  motion:     brandMotion,
  z:          brandZ,
  components: brandComponents,
  keyframes:  brandKeyframes,
} as const;

export default brandTokens;
export type BrandTokens = typeof brandTokens;
