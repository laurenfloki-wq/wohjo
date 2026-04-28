// Marketing screenshots — "See it in action" landing-page section.
// 2026-04-27 · Cowork autonomous Item 4
//
// Three inline-SVG mocks framed as Android phones:
//   1. Receipt with WLES seal — the hero (substrate-defining moment)
//   2. Worker home, live shift in progress (F-mark breathing, amber dot)
//   3. Supervisor SMS approval thread (synthetic structured SMS + YES ALL)
//
// Why inline SVG / no external assets:
//   - Single source of truth — no images-folder coordination
//   - Synthetic data baked into the component; no "is this real?" risk
//   - Renders consistently regardless of CDN / image-optimisation status
//   - Light footprint (≤ ~6 KB compressed)
//
// Synthetic data discipline:
//   - "Sample Worker" not real names
//   - Sydney CBD construction, plausible 7am-3:30pm shift
//   - $28.47/hr per CLAUDE.md canonical
//   - WLES hash is a fixed 64-char hex placeholder
//   - Phone numbers are obvious +61 4XX XXX XXX patterns

'use client';

import type { CSSProperties, FC } from 'react';

// ─── Brand tokens used inline (matches src/styles/brand-tokens.ts) ───
const T = {
  charcoal:    '#0F0F10',
  charcoal800: '#1A1A1C',
  charcoal500: '#55555C',
  charcoal400: '#7A7A82',
  charcoal300: '#A3A3A8',
  charcoal200: '#CECED2',
  cream:       '#F5F2EA',
  cream200:    '#EDE9DF',
  cream300:    '#E2DDD0',
  forest:      '#2D5F3F',
  forest700:   '#1F4A2E',
  forest100:   '#E4F1E8',
  amber:       '#D9A548',
  amber700:    '#B48630',
  amber100:    '#FAEBCF',
  warmRed:     '#C74B3A',
  fontDisplay: "'Archivo Narrow', system-ui, sans-serif",
  fontSans:    "'Inter', system-ui, sans-serif",
  fontMono:    "'JetBrains Mono', 'SF Mono', ui-monospace, monospace",
} as const;

// ─── Phone-bezel framing ──────────────────────────────────────────
const PhoneFrame: FC<{ children: React.ReactNode; height?: number }> = ({
  children,
  height = 640,
}) => (
  <div
    style={{
      width: 320,
      height,
      margin: '0 auto',
      background: T.charcoal800,
      borderRadius: 38,
      padding: 10,
      boxShadow: 'inset 0 0 0 2px #26262A, 0 8px 22px rgba(15,15,16,0.18)',
    }}
  >
    <div
      style={{
        width: '100%',
        height: '100%',
        background: T.cream,
        borderRadius: 28,
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          height: 24,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 18px',
          fontFamily: T.fontMono,
          fontSize: 11,
          color: T.charcoal,
          flexShrink: 0,
        }}
      >
        <span>9:41</span>
        <span>5G ▮▮▮</span>
      </div>
      {children}
    </div>
  </div>
);

// ─── F-mark inline SVG (mirrors public/brand/f-mark-three-bar.svg) ──
const FMarkSvg: FC<{
  fill: string;
  size?: number;
  opacity?: number;
  style?: CSSProperties;
}> = ({ fill, size = 96, opacity = 0.12, style }) => (
  <svg
    viewBox="0 0 96 96"
    width={size}
    height={size}
    style={{ opacity, pointerEvents: 'none', ...style }}
    aria-hidden="true"
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

// ═══════════════════════════════════════════════════════════════════
// 1. Receipt with WLES seal — HERO
// Sourced from design-branch/all-screens.html FSTR-7P2K9Q canonical.
// The ONE cream moment: serrated white ticket on cream surface with
// amber rubber-stamp seal, full SHA-256, WLES v1.0 Verified pill,
// Share/Verify/History actions.
// ═══════════════════════════════════════════════════════════════════
const ReceiptShot: FC = () => (
  <PhoneFrame>
    {/* Cream surface — the ONE cream moment */}
    <div
      style={{
        flex: 1,
        background: T.cream,
        padding: '18px 18px 20px',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
      }}
    >
      {/* Serrated white "ticket" with content overlay */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          background: '#FFFFFF',
          padding: '20px 18px 22px',
          textAlign: 'center',
          boxShadow: '0 1px 2px rgba(15,15,16,0.05)',
          maskImage:
            'radial-gradient(circle at 0% 0%, transparent 6px, #000 6px), radial-gradient(circle at 100% 0%, transparent 6px, #000 6px), radial-gradient(circle at 0% 100%, transparent 6px, #000 6px), radial-gradient(circle at 100% 100%, transparent 6px, #000 6px)',
          maskComposite: 'intersect',
        }}
      >
        {/* Amber rubber-stamp seal (top-right, slight tilt) */}
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 64,
            height: 64,
            transform: 'rotate(-8deg)',
            opacity: 0.95,
          }}
          aria-hidden="true"
        >
          <svg viewBox="0 0 96 96" width={64} height={64}>
            <circle cx="48" cy="48" r="42" fill="none" stroke={T.amber} strokeWidth="2" />
            <circle cx="48" cy="48" r="36" fill="none" stroke={T.amber} strokeWidth="1" />
            <text
              x="48"
              y="46"
              fontFamily={T.fontDisplay}
              fontWeight="700"
              fontSize="13"
              fill={T.amber}
              textAnchor="middle"
            >
              SEALED
            </text>
            <line x1="32" y1="51" x2="64" y2="51" stroke={T.amber} strokeWidth="0.8" />
            <text
              x="48"
              y="62"
              fontFamily={T.fontMono}
              fontWeight="600"
              fontSize="6"
              fill={T.amber}
              textAnchor="middle"
            >
              23 APR 2026
            </text>
            <text
              x="48"
              y="78"
              fontFamily={T.fontDisplay}
              fontWeight="600"
              fontSize="5"
              fill={T.amber}
              textAnchor="middle"
              letterSpacing="1"
            >
              WLES v1.0
            </text>
          </svg>
        </div>

        <div
          style={{
            fontFamily: T.fontDisplay,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.20em',
            textTransform: 'uppercase',
            color: T.charcoal500,
            marginBottom: 6,
          }}
        >
          FLOSTRUCTION
        </div>
        <div
          style={{
            fontFamily: T.fontMono,
            fontSize: 13,
            letterSpacing: '0.08em',
            color: T.charcoal,
            marginBottom: 14,
          }}
        >
          FSTR-7P2K9Q
        </div>
        <div
          style={{
            fontFamily: T.fontDisplay,
            fontSize: 32,
            fontWeight: 600,
            color: T.charcoal,
            lineHeight: 1,
            marginBottom: 4,
          }}
        >
          8 h 2 m
        </div>
        <div
          style={{
            fontFamily: T.fontDisplay,
            fontSize: 14,
            fontWeight: 600,
            color: T.charcoal,
            marginTop: 10,
          }}
        >
          João Silva
        </div>
        <div
          style={{
            fontFamily: T.fontSans,
            fontSize: 11,
            color: T.charcoal500,
            marginTop: 2,
          }}
        >
          Westgate Tower · L9
        </div>
        <div
          style={{
            fontFamily: T.fontSans,
            fontSize: 10,
            color: T.charcoal500,
            marginTop: 8,
            lineHeight: 1.45,
          }}
        >
          Thu 23 Apr 2026 · 07:00 — 15:32
          <br />
          30 min break
        </div>
        <div
          style={{
            fontFamily: T.fontSans,
            fontSize: 10,
            color: T.charcoal500,
            marginTop: 6,
            fontStyle: 'italic',
          }}
        >
          Approved by Pat (supervisor) · 15:44 AEST
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            marginTop: 12,
            padding: '4px 10px',
            borderRadius: 9999,
            background: T.forest100,
            color: T.forest700,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.04em',
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M5 12l5 5 9-11"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          WLES v1.0 Verified
        </div>
        <div
          style={{
            fontFamily: T.fontDisplay,
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: T.charcoal400,
            marginTop: 12,
          }}
        >
          SHA-256 · WLES v1.0 canonical
        </div>
        <div
          style={{
            fontFamily: T.fontMono,
            fontSize: 8,
            color: T.charcoal500,
            marginTop: 4,
            wordBreak: 'break-all',
            lineHeight: 1.4,
            padding: '0 8px',
          }}
        >
          a3b5c7d2f819e4b0c1d23a4f5e6b789c
          <br />
          0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a
        </div>
      </div>

      {/* Action bar below the ticket */}
      <div
        style={{
          fontFamily: T.fontDisplay,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          color: T.charcoal,
          textTransform: 'uppercase',
          marginTop: 4,
        }}
      >
        Share<span style={{ color: T.charcoal400, margin: '0 8px' }}>·</span>
        Verify<span style={{ color: T.charcoal400, margin: '0 8px' }}>·</span>
        History
      </div>
    </div>
  </PhoneFrame>
);

// ═══════════════════════════════════════════════════════════════════
// 2. Worker home — live shift in progress
// Sourced from design-branch/all-screens.html "Shift in progress at
// Westgate Tower L9" canonical. Charcoal full-bleed, hero shift card
// with pulsing amber LIVE pill + static F-mark watermark.
//
// NO earnings field — Flostruction is records substrate, not payroll
// calculator. Architectural decision per memory #18: Flostruction
// reports verified hours; payroll systems do the calculation.
// ═══════════════════════════════════════════════════════════════════
const WorkerHomeShot: FC = () => (
  <PhoneFrame>
    {/* Charcoal full-bleed body */}
    <div
      style={{
        flex: 1,
        background: T.charcoal,
        color: T.cream,
        padding: '20px 22px 22px',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* Eyebrow */}
      <div
        style={{
          fontFamily: T.fontDisplay,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'lowercase',
          color: 'rgba(245,242,234,0.65)',
          textAlign: 'center',
        }}
      >
        live · westgate tower · L9
      </div>

      {/* Hero shift card — charcoal800 panel, LIVE pill, elapsed time */}
      <div
        style={{
          background: T.charcoal800,
          border: '1px solid rgba(245,242,234,0.10)',
          borderRadius: 12,
          padding: '24px 20px 22px',
          position: 'relative',
          overflow: 'hidden',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          minHeight: 240,
        }}
      >
        <FMarkSvg
          fill={T.cream}
          size={96}
          opacity={0.12}
          style={{ position: 'absolute', bottom: 18, right: 18 }}
        />

        {/* LIVE pill with pulse dot */}
        <div
          style={{
            alignSelf: 'center',
            display: 'inline-flex',
            alignItems: 'center',
            padding: '4px 10px',
            borderRadius: 9999,
            background: T.amber,
            color: T.charcoal,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: T.charcoal,
              marginRight: 6,
            }}
          />
          Live
        </div>

        {/* Site name */}
        <div
          style={{
            fontFamily: T.fontDisplay,
            fontSize: 18,
            fontWeight: 600,
            color: T.cream,
            marginTop: 6,
          }}
        >
          Westgate Tower · L9
        </div>

        {/* Elapsed time — large, hero */}
        <div
          style={{
            fontFamily: T.fontDisplay,
            fontSize: 44,
            fontWeight: 600,
            color: T.cream,
            lineHeight: 1,
            marginTop: 8,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          3 h 42 m
        </div>

        {/* Clocked-in subtitle */}
        <div
          style={{
            fontFamily: T.fontMono,
            fontSize: 11,
            color: 'rgba(245,242,234,0.65)',
            marginTop: 4,
          }}
        >
          clocked in 07:00
        </div>
      </div>

      {/* Primary action — End shift (cream surface on charcoal) */}
      <button
        type="button"
        style={{
          border: 'none',
          borderRadius: 10,
          background: T.cream,
          color: T.charcoal,
          padding: '14px 16px',
          fontFamily: T.fontDisplay,
          fontWeight: 600,
          fontSize: 14,
          letterSpacing: '0.02em',
          cursor: 'pointer',
        }}
      >
        End shift
      </button>

      {/* Secondary action — Take a break (outline) */}
      <button
        type="button"
        style={{
          border: '1px solid rgba(245,242,234,0.30)',
          borderRadius: 10,
          background: 'transparent',
          color: T.cream,
          padding: '12px 16px',
          fontFamily: T.fontDisplay,
          fontWeight: 600,
          fontSize: 13,
          letterSpacing: '0.02em',
          cursor: 'pointer',
        }}
      >
        Take a break
      </button>
    </div>
  </PhoneFrame>
);

// ═══════════════════════════════════════════════════════════════════
// 3. Supervisor SMS approval thread
// SMS body matches src/lib/sms/compose.ts composeBatchSMS production
// template verbatim. iMessage-styled, synthetic data only.
// Confirmation bubble is hand-aligned to records-substrate posture
// (records sealed; payroll figure described as SENT to payroll, not
// calculated by Flostruction).
// ═══════════════════════════════════════════════════════════════════
const SupervisorSmsShot: FC = () => (
  <PhoneFrame>
    {/* SMS-thread header */}
    <div
      style={{
        background: T.charcoal,
        color: T.cream,
        padding: '12px 18px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid rgba(245,242,234,0.12)',
        flexShrink: 0,
      }}
    >
      <div>
        <div style={{ fontFamily: T.fontDisplay, fontWeight: 600, fontSize: 13 }}>
          Flostruction
        </div>
        <div
          style={{
            fontFamily: T.fontMono,
            fontSize: 10,
            color: 'rgba(245,242,234,0.65)',
          }}
        >
          +61 4XX XXX 999
        </div>
      </div>
      <span
        style={{
          fontFamily: T.fontMono,
          fontSize: 9,
          color: 'rgba(245,242,234,0.55)',
        }}
      >
        Today
      </span>
    </div>

    {/* iMessage-style thread surface */}
    <div
      style={{
        flex: 1,
        background: T.cream200,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        overflow: 'hidden',
      }}
    >
      {/* Inbound SMS bubble — composeBatchSMS clean-only verbatim */}
      <div
        style={{
          alignSelf: 'flex-start',
          maxWidth: '85%',
          background: '#E5E5EA',
          color: T.charcoal,
          borderRadius: '14px 14px 14px 4px',
          padding: '10px 12px',
          fontFamily: T.fontSans,
          fontSize: 12,
          lineHeight: 1.5,
          whiteSpace: 'pre-line',
        }}
      >
        Flostruction: 2 timesheet(s) from your crew.
        {'\n'}Joao Silva - 8hrs Westgate Tower XYZ123
        {'\n'}Demo Worker - 7.5hrs Westgate Tower ABC456
        {'\n'}Reply YES ALL to approve.
      </div>

      {/* Outbound bubble — supervisor reply */}
      <div
        style={{
          alignSelf: 'flex-end',
          maxWidth: '60%',
          background: '#0A84FF',
          color: '#FFFFFF',
          borderRadius: '14px 14px 4px 14px',
          padding: '8px 12px',
          fontFamily: T.fontMono,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.04em',
        }}
      >
        YES ALL
      </div>

      {/* Inbound confirmation bubble (records-substrate posture) */}
      <div
        style={{
          alignSelf: 'flex-start',
          maxWidth: '85%',
          background: '#E5E5EA',
          color: T.charcoal,
          borderRadius: '14px 14px 14px 4px',
          padding: '10px 12px',
          fontFamily: T.fontSans,
          fontSize: 12,
          lineHeight: 1.5,
          whiteSpace: 'pre-line',
        }}
      >
        Flostruction: 2 timesheets approved.
        {'\n'}Records sealed. Sent to payroll. Workers notified.
      </div>

      {/* Status row — describes what was SENT to payroll, not calculated */}
      <div
        style={{
          marginTop: 'auto',
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          padding: '8px 0 0',
        }}
      >
        {['8 hrs sealed', '7.5 hrs sealed', '$441.29 to payroll'].map((lbl) => (
          <span
            key={lbl}
            style={{
              display: 'inline-flex',
              padding: '3px 8px',
              borderRadius: 9999,
              background: T.forest100,
              color: T.forest700,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {lbl}
          </span>
        ))}
      </div>
    </div>
  </PhoneFrame>
);

// ═══════════════════════════════════════════════════════════════════
// MarketingScreenshots — exported section
// ═══════════════════════════════════════════════════════════════════
export const MarketingScreenshots: FC = () => (
  <section
    id="see-it-in-action"
    style={{
      background: T.cream,
      padding: '72px 24px',
      borderTop: `1px solid ${T.cream300}`,
      borderBottom: `1px solid ${T.cream300}`,
    }}
  >
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div
          style={{
            fontFamily: T.fontDisplay,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: T.charcoal500,
            marginBottom: 10,
          }}
        >
          See it in action
        </div>
        <h2
          style={{
            fontFamily: T.fontDisplay,
            fontSize: 'clamp(1.8rem, 4vw, 2.6rem)',
            fontWeight: 700,
            color: T.charcoal,
            margin: 0,
            lineHeight: 1.15,
            maxWidth: 780,
            marginInline: 'auto',
          }}
        >
          The receipt is the proof. The supervisor SMS is the workflow. The worker app is the source.
        </h2>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 32,
          alignItems: 'start',
        }}
      >
        {/* Hero — receipt */}
        <div style={{ textAlign: 'center' }}>
          <ReceiptShot />
          <h3
            style={{
              fontFamily: T.fontDisplay,
              fontSize: 18,
              fontWeight: 600,
              color: T.charcoal,
              margin: '24px 0 8px',
            }}
          >
            Receipt with WLES seal
          </h3>
          <p
            style={{
              fontFamily: T.fontSans,
              fontSize: 13,
              lineHeight: 1.55,
              color: T.charcoal500,
              maxWidth: 320,
              marginInline: 'auto',
            }}
          >
            Every approved shift produces a permanent, tamper-evident record. Every hour accounted for.
          </p>
        </div>

        {/* Live shift */}
        <div style={{ textAlign: 'center' }}>
          <WorkerHomeShot />
          <h3
            style={{
              fontFamily: T.fontDisplay,
              fontSize: 18,
              fontWeight: 600,
              color: T.charcoal,
              margin: '24px 0 8px',
            }}
          >
            Live shift in the worker&rsquo;s pocket
          </h3>
          <p
            style={{
              fontFamily: T.fontSans,
              fontSize: 13,
              lineHeight: 1.55,
              color: T.charcoal500,
              maxWidth: 320,
              marginInline: 'auto',
            }}
          >
            Workers see exactly what their shift looks like in real time. Hours that hold up the moment they&rsquo;re recorded.
          </p>
        </div>

        {/* Supervisor SMS */}
        <div style={{ textAlign: 'center' }}>
          <SupervisorSmsShot />
          <h3
            style={{
              fontFamily: T.fontDisplay,
              fontSize: 18,
              fontWeight: 600,
              color: T.charcoal,
              margin: '24px 0 8px',
            }}
          >
            Supervisor approval by SMS
          </h3>
          <p
            style={{
              fontFamily: T.fontSans,
              fontSize: 13,
              lineHeight: 1.55,
              color: T.charcoal500,
              maxWidth: 320,
              marginInline: 'auto',
            }}
          >
            Site managers approve shifts in seconds. No new app to learn. The structure of the SMS is the structure of the substrate.
          </p>
        </div>
      </div>

      <p
        style={{
          fontFamily: T.fontSans,
          fontSize: 11,
          color: T.charcoal400,
          textAlign: 'center',
          margin: '40px auto 0',
          maxWidth: 600,
          lineHeight: 1.55,
        }}
      >
        Examples shown with synthetic data. Names, sites, hashes, and amounts are illustrative — your records use your workers and your sites.
      </p>
    </div>
  </section>
);
