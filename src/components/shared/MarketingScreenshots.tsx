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
// ═══════════════════════════════════════════════════════════════════
const ReceiptShot: FC = () => (
  <PhoneFrame>
    {/* Receipt hero — charcoal block with synthetic WLES hash */}
    <div
      style={{
        background: T.charcoal,
        color: T.cream,
        padding: '20px 22px 22px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontFamily: T.fontDisplay,
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'rgba(245,242,234,0.65)',
          marginBottom: 6,
        }}
      >
        Verified record
      </div>
      <div
        style={{
          fontFamily: T.fontMono,
          fontSize: 19,
          letterSpacing: '0.04em',
          color: T.cream,
        }}
      >
        FSTR-DEMO0001
      </div>
      <div
        style={{
          fontFamily: T.fontMono,
          fontSize: 9,
          color: 'rgba(245,242,234,0.55)',
          marginTop: 8,
          wordBreak: 'break-all',
          lineHeight: 1.35,
          padding: '0 4px',
        }}
      >
        wles:v1:7a3f8c2d9e1b4a05c8f3d6e2b9c4a17f8d3e0c52a6b8e1d4f9c3a7e0b6d2c5e9
      </div>
    </div>

    {/* Receipt body with F-mark watermark */}
    <div
      style={{
        flex: 1,
        background: T.cream,
        padding: '14px 22px 16px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <FMarkSvg
        fill={T.forest}
        size={120}
        opacity={0.12}
        style={{ position: 'absolute', bottom: 14, right: 14 }}
      />
      {[
        ['Worker', 'Sample Worker'],
        ['Site', 'Mo Site 1'],
        ['Date', 'Mon 27 Apr 2026'],
        ['Arrived', '07:00'],
        ['Departed', '15:30'],
        ['Break', '30m'],
      ].map(([l, v]) => (
        <div
          key={l}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '6px 0',
            borderBottom: `1px dashed ${T.cream300}`,
            fontSize: 12,
          }}
        >
          <span
            style={{
              color: T.charcoal500,
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {l}
          </span>
          <span style={{ fontFamily: T.fontMono, color: T.charcoal }}>{v}</span>
        </div>
      ))}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '8px 0 4px',
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        <span style={{ color: T.charcoal }}>Duration</span>
        <span style={{ fontFamily: T.fontMono, color: T.charcoal }}>8.00 hrs</span>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
        {['Sealed', 'GPS verified', 'Approved'].map((lbl) => (
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
      <p
        style={{
          fontSize: 9,
          color: T.charcoal500,
          margin: '12px 0 0',
          lineHeight: 1.5,
          position: 'relative',
          zIndex: 1,
        }}
      >
        Tamper-evident · cannot be quietly altered after the fact.
      </p>
    </div>
  </PhoneFrame>
);

// ═══════════════════════════════════════════════════════════════════
// 2. Worker home — live shift in progress
// ═══════════════════════════════════════════════════════════════════
const WorkerHomeShot: FC = () => (
  <PhoneFrame>
    {/* App header — eyebrow + greeting + live chip */}
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        padding: '8px 22px 4px',
      }}
    >
      <div>
        <div
          style={{
            fontFamily: T.fontDisplay,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: T.charcoal500,
          }}
        >
          Flostruction
        </div>
        <div
          style={{
            fontFamily: T.fontDisplay,
            fontSize: 22,
            fontWeight: 600,
            color: T.charcoal,
            lineHeight: 1.15,
          }}
        >
          G&rsquo;day, Sample
        </div>
      </div>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '3px 8px',
          borderRadius: 9999,
          background: T.amber100,
          color: T.amber700,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: T.amber,
            marginRight: 6,
          }}
        />
        Live
      </span>
    </div>

    {/* In-progress card — charcoal panel, F-mark breathing, earnings ticker */}
    <div style={{ padding: '6px 22px 22px', flex: 1 }}>
      <div
        style={{
          background: T.charcoal,
          color: T.cream,
          borderRadius: 10,
          padding: '20px 18px',
          border: '1px solid rgba(245,242,234,0.16)',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: T.fontSans,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <FMarkSvg
          fill={T.cream}
          size={110}
          opacity={0.12}
          style={{ position: 'absolute', bottom: 14, right: 14 }}
        />
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'rgba(245,242,234,0.70)',
          }}
        >
          Status · On site
        </div>
        <div
          style={{
            fontFamily: T.fontDisplay,
            fontSize: 22,
            fontWeight: 600,
          }}
        >
          Mo Site 1
        </div>
        {[
          ['Arrived', '07:00'],
          ['Time on site', '04:14'],
          ['Earnings so far', '$120.65'],
        ].map(([l, v]) => (
          <div
            key={l}
            style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}
          >
            <span>{l}</span>
            <span style={{ fontFamily: T.fontMono, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
          </div>
        ))}
        <button
          style={{
            border: 'none',
            borderRadius: 8,
            background: T.warmRed,
            color: T.cream,
            padding: '12px 16px',
            fontFamily: T.fontSans,
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: '0.02em',
            cursor: 'pointer',
            position: 'relative',
            zIndex: 1,
          }}
        >
          End Shift
        </button>
        <p
          style={{
            fontSize: 10,
            color: 'rgba(245,242,234,0.62)',
            margin: 0,
            position: 'relative',
            zIndex: 1,
          }}
        >
          Press and hold to confirm. Sealed in WLES the moment you tap.
        </p>
      </div>
    </div>
  </PhoneFrame>
);

// ═══════════════════════════════════════════════════════════════════
// 3. Supervisor SMS approval thread
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

    {/* Inbound SMS bubble — structured shift request */}
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
      <div
        style={{
          alignSelf: 'flex-start',
          maxWidth: '85%',
          background: T.cream,
          color: T.charcoal,
          borderRadius: '12px 12px 12px 4px',
          padding: '10px 12px',
          fontFamily: T.fontSans,
          fontSize: 12,
          lineHeight: 1.5,
          boxShadow: '0 1px 2px rgba(15,15,16,0.06)',
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 4 }}>2 shifts ready · Mo Site 1</div>
        <div style={{ fontFamily: T.fontMono, fontSize: 11 }}>
          [A1] Sample Worker · Mon 27 Apr · 8.00 hrs · clean
          <br />
          [B2] Demo Worker 2 · Mon 27 Apr · 7.50 hrs · clean
        </div>
        <div style={{ marginTop: 6 }}>
          Reply <strong>YES ALL</strong> or <strong>YES [code]</strong> /{' '}
          <strong>NO [code]</strong>
        </div>
      </div>

      {/* Outbound SMS bubble — "YES ALL" supervisor reply */}
      <div
        style={{
          alignSelf: 'flex-end',
          maxWidth: '60%',
          background: T.forest,
          color: T.cream,
          borderRadius: '12px 12px 4px 12px',
          padding: '8px 12px',
          fontFamily: T.fontMono,
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        YES ALL
      </div>

      {/* Inbound confirmation bubble */}
      <div
        style={{
          alignSelf: 'flex-start',
          maxWidth: '80%',
          background: T.cream,
          color: T.charcoal,
          borderRadius: '12px 12px 12px 4px',
          padding: '10px 12px',
          fontFamily: T.fontSans,
          fontSize: 12,
          lineHeight: 1.5,
          boxShadow: '0 1px 2px rgba(15,15,16,0.06)',
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 4 }}>2 shifts approved ✓</div>
        Sent to payroll. Workers notified. Records sealed.
      </div>

      {/* Status row */}
      <div
        style={{
          marginTop: 'auto',
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          padding: '8px 0 0',
        }}
      >
        {['8.00 hrs sealed', '7.50 hrs sealed', '$441.29 to payroll'].map((lbl) => (
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
            Workers see exactly what they&rsquo;ve earned, in real time. Hours that hold up the moment they&rsquo;re recorded.
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
