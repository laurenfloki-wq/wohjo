// Landing-surface design tokens — single source of truth.
//
// Resolves the two ad-hoc ambers the page used to run (burnt #c8530a in
// marketing chrome vs gold #D9A548 in the product mockups) into a
// semantic system:
//   --signal   (burnt ochre)  the ONE brand action colour — primary CTA
//                             and the "sealed" marketing accent. Deep
//                             ochre reads authoritative/permanent.
//   --verified (gold)         product-UI accent for the seal / verified
//                             state INSIDE device mockups + the seal
//                             demo. Deliberately distinct from --signal
//                             so "product chrome" and "marketing chrome"
//                             never blur. `verifiedBright` is the in-UI
//                             gold; `verified` is the AA-safe gold for
//                             gold-on-paper marketing text.
//
// The page <style> :root is generated from `landingRootVars` below and
// the Remotion seal composition imports `landingTokens` directly, so
// both surfaces consume the same values — no re-picked colours.

export const landingTokens = {
  ink: '#0e0c09',
  paper: '#faf7f2',
  surface: '#ffffff',
  surfaceDark: '#16130f',
  border: 'rgba(26,20,16,0.12)',
  borderDark: 'rgba(255,255,255,0.10)',
  muted: '#6b6258',
  mutedDark: 'rgba(255,255,255,0.64)',
  signal: '#c8530a',
  signalHover: '#a8450a',
  signalSoft: 'rgba(200,83,10,0.10)',
  verified: '#b7791f', // AA-safe gold for gold-on-paper marketing text
  verifiedBright: '#d9a548', // in-product gold (mockups + seal demo)
  forest: '#2d5f3f',
  forestSoft: '#e4f1e8',
} as const;

export type LandingTokens = typeof landingTokens;

// CSS custom-property block injected into the page <style>. Kept in sync
// with `landingTokens` above so there is exactly one source of truth.
export const landingRootVars = `
  --ink: ${landingTokens.ink};
  --paper: ${landingTokens.paper};
  --surface: ${landingTokens.surface};
  --surface-dark: ${landingTokens.surfaceDark};
  --border: ${landingTokens.border};
  --border-dark: ${landingTokens.borderDark};
  --muted: ${landingTokens.muted};
  --muted-dark: ${landingTokens.mutedDark};
  --signal: ${landingTokens.signal};
  --signal-hover: ${landingTokens.signalHover};
  --signal-soft: ${landingTokens.signalSoft};
  --verified: ${landingTokens.verified};
  --forest: ${landingTokens.forest};
  --forest-soft: ${landingTokens.forestSoft};

  /* Fluid type scale (Barlow / Barlow Condensed retained). */
  --step--1: clamp(0.82rem, 0.79rem + 0.16vw, 0.9rem);
  --step-0:  clamp(1rem, 0.96rem + 0.2vw, 1.08rem);
  --step-1:  clamp(1.18rem, 1.08rem + 0.5vw, 1.45rem);
  --step-2:  clamp(1.5rem, 1.28rem + 1.1vw, 2.1rem);
  --step-3:  clamp(2rem, 1.6rem + 2vw, 3rem);
  --step-4:  clamp(2.5rem, 1.9rem + 3vw, 4.4rem);
  --step-5:  clamp(3rem, 2.2rem + 4vw, 5.4rem);

  /* Spatial system (4/8 base, fluid section rhythm). */
  --gutter: clamp(20px, 5vw, 64px);
  --space-section: clamp(76px, 9vw, 132px);
  --space-block: clamp(40px, 5vw, 72px);
  --maxw: 1240px;
  --measure: 64ch;
  --radius: 16px;
  --radius-sm: 10px;
`;
