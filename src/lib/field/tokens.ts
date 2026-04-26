// Flostruction Field — Design tokens
// B3 colour semantics + B4 typography consolidation.
// Single source of truth imported by every /field page + component.

export const palette = {
  /**
   * B3 colour semantics — single consistent meaning across the app.
   *
   *   navy   — primary brand, headers, primary actions, hero backgrounds
   *   warm   — body backgrounds, text on navy
   *   amber  — accent only, verification markers, highlight
   *   green  — positive confirmation; shift confirmed, receipt generated,
   *            GPS verified. Never shown when underlying state is
   *            incomplete or zero.
   *   red    — destructive actions only. Never primary happy-path.
   *   orange — warnings and "awaiting action" states.
   */
  navy: '#0E1C2F',
  navyTint: '#1A2D45',
  warm: '#F5F3EE',
  warmTint: '#EDE9E0',
  warmTextOnNavy: 'rgba(245,243,238,0.92)',
  mutedOnNavy: 'rgba(245,243,238,0.58)',
  border: '#E5E1D7',
  borderOnNavy: 'rgba(245,243,238,0.16)',
  amber: '#D18B4A',
  amberTint: 'rgba(209,139,74,0.12)',
  green: '#166534',
  greenTint: '#DCFCE7',
  greenText: '#166534',
  red: '#B91C1C',
  redTint: '#FEE2E2',
  orange: '#C2410C',
  orangeTint: '#FFEDD5',
  textPrimary: '#0E1C2F',
  textSecondary: '#475267',
  textTertiary: '#7B8494',
} as const;

export const typography = {
  /**
   * B4 typography consolidation — Source Serif Pro + Inter + JetBrains Mono.
   * All three are SIL OFL licensed, self-hosted via next/font/google in
   * app/layout.tsx. Exactly two families visible on any single screen:
   *
   *   Receipt screen      — serif + mono
   *   Home screen         — sans + mono (timestamps)
   *   Sign-in / onboarding — sans only
   */
  serif: "'Source Serif Pro', 'Source Serif 4', Georgia, serif",
  sans: "'Inter', 'Inter Variable', system-ui, -apple-system, Segoe UI, sans-serif",
  mono: "'JetBrains Mono', 'JetBrains Mono Variable', ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;

export const radius = {
  card: '10px',
  button: '8px',
  pill: '9999px',
} as const;

export const shadow = {
  card: '0 1px 2px rgba(14,28,47,0.06), 0 4px 10px rgba(14,28,47,0.04)',
  cardHover: '0 2px 4px rgba(14,28,47,0.08), 0 8px 20px rgba(14,28,47,0.06)',
  modal: '0 12px 32px rgba(14,28,47,0.18)',
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
