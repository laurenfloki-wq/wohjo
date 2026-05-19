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

import { useEffect, useRef, useState, type CSSProperties, type FC } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap, ScrollTrigger, MM } from '@/lib/motion/gsap-client';

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
export const PhoneFrame: FC<{ children: React.ReactNode; height?: number }> = ({
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
//
// Motion (brief §5): the seal-forming scene. ScrollTrigger pinned on
// desktop, scrubbed by scroll position. Fields populate, the SHA-256
// hash resolves via character-scramble settling to the canonical
// 64-hex string, then the SEALED stamp + WLES v1.0 Verified pill
// resolve in with one decisive fade-in. transform/opacity only — no
// bounce, no layout-property animation.
//
// Reduced-motion: every animatable element renders in its final state
// from first paint; the scrubbed timeline never installs. The visitor
// sees the complete sealed receipt statically — same information, no
// motion required.
// ═══════════════════════════════════════════════════════════════════
const RECEIPT_HASH_LINE_1 = 'a3b5c7d2f819e4b0c1d23a4f5e6b789c';
const RECEIPT_HASH_LINE_2 = '0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a';
const HASH_SCRAMBLE_CHARS = '0123456789abcdef';

export const ReceiptShot: FC = () => {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;

      const mm = gsap.matchMedia();
      mm.add(
        {
          isFull: MM.full,
          isMobile: MM.mobile,
          isReduced: MM.reduced,
        },
        (ctx) => {
          const { isReduced, isFull } = ctx.conditions as {
            isFull: boolean;
            isMobile: boolean;
            isReduced: boolean;
          };
          // Reduced-motion: the static JSX already shows the final
          // sealed receipt. No timeline, no ScrollTrigger.
          if (isReduced) return;

          const seal = root.querySelector<HTMLElement>('[data-anim="seal"]');
          const brand = root.querySelector<HTMLElement>('[data-anim="brand"]');
          const id = root.querySelector<HTMLElement>('[data-anim="id"]');
          const hours = root.querySelector<HTMLElement>('[data-anim="hours"]');
          const details = root.querySelector<HTMLElement>('[data-anim="details"]');
          const verifiedPill = root.querySelector<HTMLElement>(
            '[data-anim="verified-pill"]'
          );
          const hashLabel = root.querySelector<HTMLElement>('[data-anim="hash-label"]');
          const hashLine1 = root.querySelector<HTMLElement>('[data-anim="hash-line-1"]');
          const hashLine2 = root.querySelector<HTMLElement>('[data-anim="hash-line-2"]');

          const animTargets = [
            brand,
            id,
            hours,
            details,
            hashLabel,
            hashLine1,
            hashLine2,
            verifiedPill,
            seal,
          ].filter(Boolean) as HTMLElement[];

          gsap.set(animTargets, { opacity: 0 });
          if (seal) gsap.set(seal, { scale: 0.94, transformOrigin: 'center center' });
          if (hashLine1) hashLine1.textContent = '';
          if (hashLine2) hashLine2.textContent = '';

          // Pin only on the full (desktop, no reduced-motion) tier.
          // Mobile: same timeline, scrubbed by entry, no pin — pinning
          // a 100vh section on mid-range Android is a known UX failure.
          const pinTarget = isFull
            ? (root.closest('#see-it-in-action') as HTMLElement | null)
            : null;

          const tl = gsap.timeline({
            scrollTrigger: {
              trigger: root,
              start: isFull ? 'top center' : 'top 85%',
              end: isFull ? '+=600' : 'bottom 40%',
              scrub: 0.6,
              pin: pinTarget || false,
              pinSpacing: !!pinTarget,
              anticipatePin: pinTarget ? 1 : 0,
            },
          });

          tl.to(brand, { opacity: 1, duration: 0.4 }, 0)
            .to(id, { opacity: 1, duration: 0.4 }, 0.05)
            .to(hours, { opacity: 1, duration: 0.4 }, 0.15)
            .to(details, { opacity: 1, duration: 0.4 }, 0.25)
            .to(hashLabel, { opacity: 1, duration: 0.4 }, 0.4)
            .to(hashLine1, { opacity: 1, duration: 0.2 }, 0.45)
            .to(hashLine2, { opacity: 1, duration: 0.2 }, 0.5);

          if (hashLine1) {
            tl.to(
              hashLine1,
              {
                duration: 0.9,
                scrambleText: {
                  text: RECEIPT_HASH_LINE_1,
                  chars: HASH_SCRAMBLE_CHARS,
                  speed: 0.9,
                  revealDelay: 0,
                },
              },
              0.5
            );
          }
          if (hashLine2) {
            tl.to(
              hashLine2,
              {
                duration: 0.9,
                scrambleText: {
                  text: RECEIPT_HASH_LINE_2,
                  chars: HASH_SCRAMBLE_CHARS,
                  speed: 0.9,
                  revealDelay: 0,
                },
              },
              0.7
            );
          }

          // One decisive seal stamp — opacity + scale resolve to 1
          // together. No bounce, no overshoot. Section §5 acceptance.
          tl.to(seal, { opacity: 0.95, scale: 1, duration: 0.4, ease: 'power2.out' }, 1.4)
            .to(verifiedPill, { opacity: 1, duration: 0.35 }, 1.55);
        }
      );

      return () => mm.revert();
    },
    { scope: rootRef }
  );

  return (
  <PhoneFrame>
    {/* Cream surface — the ONE cream moment */}
    <div
      ref={rootRef}
      data-receipt-root
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
          data-anim="seal"
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
          data-anim="brand"
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
          data-anim="id"
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
          data-anim="hours"
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
        <div data-anim="details">
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
        </div>
        <div
          data-anim="verified-pill"
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
          data-anim="hash-label"
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
          <div data-anim="hash-line-1">{RECEIPT_HASH_LINE_1}</div>
          <div data-anim="hash-line-2">{RECEIPT_HASH_LINE_2}</div>
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
};

// ═══════════════════════════════════════════════════════════════════
// 2. Worker home — live shift in progress
// Sourced from design-branch/all-screens.html "Shift in progress at
// Westgate Tower L9" canonical. Charcoal full-bleed, hero shift card
// with pulsing amber LIVE pill + static F-mark watermark.
//
// NO earnings field — Flostruction is records substrate, not payroll
// calculator. Architectural decision per memory #18: Flostruction
// reports verified hours; payroll systems do the calculation.
//
// Motion (brief §5): a real incrementing timer from a fixed notional
// clock-in. Initial display is 3h 42m 0s; seconds tick every second.
// Synthetic data retained — clearly labelled in the section footer.
//
// Reduced-motion: the timer does not tick. The card renders the
// notional snapshot 3h 42m statically (no seconds), matching the
// audit's static baseline. Same information conveyed without motion.
// ═══════════════════════════════════════════════════════════════════
const SHIFT_START_OFFSET_SECONDS = 3 * 3600 + 42 * 60; // 3h 42m as audited

const formatElapsed = (totalSeconds: number, withSeconds: boolean) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return withSeconds
    ? `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`
    : `${h} h ${m} m`;
};

export const WorkerHomeShot: FC = () => {
  const [elapsed, setElapsed] = useState(SHIFT_START_OFFSET_SECONDS);
  const [tick, setTick] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return; // static baseline — no interval, no ticks
    setTick(true);
    const id = window.setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
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

        {/* Elapsed time — large, hero. Real ticking timer (motion brief
            §5). Reduced-motion: static "3 h 42 m" baseline. */}
        <div
          data-anim="live-timer"
          aria-live="off"
          style={{
            fontFamily: T.fontDisplay,
            fontSize: tick ? 34 : 44,
            fontWeight: 600,
            color: T.cream,
            lineHeight: 1,
            marginTop: 8,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatElapsed(elapsed, tick)}
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
};

// ═══════════════════════════════════════════════════════════════════
// 3. Supervisor SMS approval thread
// SMS body matches src/lib/sms/compose.ts composeBatchSMS production
// template verbatim. iMessage-styled, synthetic data only.
// Confirmation bubble is hand-aligned to records-substrate posture
// (records sealed; payroll figure described as SENT to payroll, not
// calculated by Flostruction).
//
// Motion (brief §5): four-beat play-once-in-view sequence. Inbound
// timesheet message arrives → YES ALL sends → confirmation returns →
// sealed pills stamp + payroll figure counts up. Plays exactly once
// when scrolled into view. Never loops.
//
// Reduced-motion: every bubble and pill renders in its final position
// from first paint; the payroll figure shows $441.29 statically; no
// ScrollTrigger is installed. The whole workflow is comprehensible
// without motion.
// ═══════════════════════════════════════════════════════════════════
const PAYROLL_FINAL = 441.29;

export const SupervisorSmsShot: FC = () => {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;

      const mm = gsap.matchMedia();
      mm.add(
        {
          isFull: MM.full,
          isMobile: MM.mobile,
          isReduced: MM.reduced,
        },
        (ctx) => {
          const { isReduced } = ctx.conditions as {
            isFull: boolean;
            isMobile: boolean;
            isReduced: boolean;
          };
          if (isReduced) return; // final-state JSX is the reduced path

          const inbound = root.querySelector<HTMLElement>('[data-sms="inbound"]');
          const outbound = root.querySelector<HTMLElement>('[data-sms="outbound"]');
          const confirm = root.querySelector<HTMLElement>('[data-sms="confirm"]');
          const pills = root.querySelectorAll<HTMLElement>('[data-sms="pill"]');
          const payrollEl = root.querySelector<HTMLElement>('[data-sms-payroll]');

          const allTargets = [inbound, outbound, confirm, ...Array.from(pills)].filter(
            Boolean
          ) as HTMLElement[];

          gsap.set(allTargets, { opacity: 0, y: 6 });
          if (payrollEl) payrollEl.textContent = '$0.00 to payroll';

          const tl = gsap.timeline({ paused: true });
          // Beat 1: inbound timesheet message
          tl.to(inbound, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }, 0)
            // Beat 2: YES ALL sends
            .to(outbound, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }, 0.8)
            // Beat 3: confirmation returns
            .to(confirm, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }, 1.5)
            // Beat 4: sealed pills stamp + payroll counts up
            .to(
              pills,
              {
                opacity: 1,
                y: 0,
                duration: 0.25,
                stagger: 0.08,
                ease: 'power2.out',
              },
              2.2
            );

          if (payrollEl) {
            const counter = { value: 0 };
            tl.to(
              counter,
              {
                value: PAYROLL_FINAL,
                duration: 0.7,
                ease: 'power1.out',
                onUpdate: () => {
                  payrollEl.textContent = `$${counter.value.toFixed(2)} to payroll`;
                },
              },
              2.3
            );
          }

          // Use an explicit onEnter rather than once:true so the
          // timeline plays reliably even if matchMedia setup races
          // with the user already having scrolled the card into
          // view. ScrollTrigger.create fires onEnter on construction
          // if the trigger is in the active zone.
          let played = false;
          ScrollTrigger.create({
            trigger: root,
            start: 'top 90%',
            end: 'bottom top',
            onEnter: () => {
              if (!played) {
                played = true;
                tl.play();
              }
            },
          });
        }
      );

      return () => mm.revert();
    },
    { scope: rootRef }
  );

  return (
  <div ref={rootRef}>
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
        data-sms="inbound"
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
        data-sms="outbound"
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
        data-sms="confirm"
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
        {['8 hrs sealed', '7.5 hrs sealed', '$441.29 to payroll'].map((lbl, idx) => (
          <span
            data-sms="pill"
            {...(idx === 2 ? { 'data-sms-payroll': '' } : {})}
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
  </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// 4. Worker records list — phone, multiple sealed shifts in chrono order
// Used on /get-started "What's included" Permanent records panel.
// Distinct from ReceiptShot (single sealed shift) — this shows the
// chain context: Joao's last several days at Westgate, each row carries
// its own intact-chain indicator. Cream surface for legibility, charcoal
// list rows. The chain-integrity strip at the bottom is the substrate's
// public claim ("every shift sealed to the WLES hash chain").
// ═══════════════════════════════════════════════════════════════════
export const WorkerRecordsShot: FC = () => {
  const rows = [
    { date: 'Mon 27 Apr', site: 'Westgate L9', hours: '8 h 12 m', hash: 'a3b5c7d2' },
    { date: 'Tue 28 Apr', site: 'Westgate L9', hours: '7 h 50 m', hash: '4e1f9a0c' },
    { date: 'Wed 29 Apr', site: 'Westgate L9', hours: '8 h 30 m', hash: '2d6b3814' },
    { date: 'Thu 30 Apr', site: 'Westgate L9', hours: '8 h 02 m', hash: '7a4f9c1e' },
  ];

  return (
    <PhoneFrame>
      <div
        style={{
          flex: 1,
          background: T.cream,
          padding: '18px 18px 20px',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div
            style={{
              fontFamily: T.fontDisplay,
              fontSize: 18,
              fontWeight: 700,
              color: T.charcoal,
              letterSpacing: '-0.01em',
            }}
          >
            Records
          </div>
          <div
            style={{
              fontFamily: T.fontMono,
              fontSize: 10,
              color: T.charcoal500,
              letterSpacing: '0.06em',
            }}
          >
            APR · 4 SHIFTS
          </div>
        </div>

        {/* List of sealed shift rows */}
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: 10,
            boxShadow: '0 1px 2px rgba(15,15,16,0.04)',
            overflow: 'hidden',
          }}
        >
          {rows.map((r, i) => (
            <div
              key={r.hash}
              style={{
                display: 'grid',
                gridTemplateColumns: '18px 1fr auto',
                alignItems: 'center',
                gap: 10,
                padding: '12px 14px',
                borderBottom: i < rows.length - 1 ? `1px solid ${T.cream300}` : 'none',
              }}
            >
              {/* Sealed checkmark */}
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: T.forest100,
                  color: T.forest700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-hidden="true"
              >
                <svg width="9" height="9" viewBox="0 0 24 24">
                  <path
                    d="M5 12l5 5 9-11"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              {/* Date / site */}
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: T.fontDisplay,
                    fontSize: 13,
                    fontWeight: 600,
                    color: T.charcoal,
                    lineHeight: 1.2,
                  }}
                >
                  {r.date}
                </div>
                <div
                  style={{
                    fontFamily: T.fontSans,
                    fontSize: 11,
                    color: T.charcoal500,
                    marginTop: 2,
                  }}
                >
                  {r.site}
                </div>
              </div>
              {/* Hours + hash prefix */}
              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    fontFamily: T.fontDisplay,
                    fontSize: 13,
                    fontWeight: 600,
                    color: T.charcoal,
                  }}
                >
                  {r.hours}
                </div>
                <div
                  style={{
                    fontFamily: T.fontMono,
                    fontSize: 9,
                    color: T.charcoal400,
                    marginTop: 2,
                    letterSpacing: '0.04em',
                  }}
                >
                  {r.hash}…
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Chain-integrity strip — bottom of view */}
        <div
          style={{
            marginTop: 'auto',
            background: T.forest100,
            color: T.forest700,
            padding: '10px 14px',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: T.fontDisplay,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
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
          Chain integrity · INTACT
        </div>
        <div
          style={{
            fontFamily: T.fontSans,
            fontSize: 10,
            color: T.charcoal400,
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          Each shift links to the previous via SHA-256.
          <br />
          Tampering with any shift breaks every chain after it.
        </div>
      </div>
    </PhoneFrame>
  );
};

// ═══════════════════════════════════════════════════════════════════
// 5. Payroll export — laptop / desktop browser frame
// Used on /get-started "What's included" Payroll exports panel.
// Stylised browser-window frame showing the Command export modal:
// pay period, format selector with the five supported providers,
// preview of Joao's verified hours rolling out as CSV. The five
// formats are the proof point — every customer's bookkeeper has
// one of these names on their stack.
// ═══════════════════════════════════════════════════════════════════
export const PayrollExportShot: FC = () => {
  const formats = ['Employment Hero', 'Xero', 'MYOB', 'KeyPay', 'Micropay'];
  return (
    <div
      style={{
        width: 480,
        maxWidth: '100%',
        margin: '0 auto',
        background: T.charcoal800,
        borderRadius: 12,
        padding: 8,
        boxShadow: '0 18px 40px -16px rgba(15,15,16,0.45)',
      }}
    >
      {/* Browser chrome */}
      <div
        style={{
          background: T.cream,
          borderRadius: 8,
          overflow: 'hidden',
          border: `1px solid ${T.cream300}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 12px',
            background: T.cream200,
            borderBottom: `1px solid ${T.cream300}`,
          }}
        >
          {/* Three traffic-light dots */}
          <div style={{ display: 'flex', gap: 5 }}>
            {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
              <span
                key={c}
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  background: c,
                  display: 'inline-block',
                }}
              />
            ))}
          </div>
          <div
            style={{
              flex: 1,
              background: '#FFFFFF',
              borderRadius: 5,
              padding: '4px 10px',
              fontFamily: T.fontMono,
              fontSize: 10,
              color: T.charcoal500,
              letterSpacing: '0.02em',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
            }}
          >
            flostruction.com/command/export
          </div>
        </div>

        {/* Modal/panel body */}
        <div style={{ padding: '20px 22px 22px' }}>
          <div
            style={{
              fontFamily: T.fontDisplay,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: T.charcoal500,
              marginBottom: 8,
            }}
          >
            Export
          </div>
          <div
            style={{
              fontFamily: T.fontDisplay,
              fontSize: 18,
              fontWeight: 700,
              color: T.charcoal,
              marginBottom: 14,
              letterSpacing: '-0.01em',
            }}
          >
            Pay period · 25 Apr → 30 Apr 2026
          </div>

          {/* Format selector chips */}
          <div
            style={{
              fontFamily: T.fontMono,
              fontSize: 9,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: T.charcoal500,
              marginBottom: 8,
            }}
          >
            Format
          </div>
          <div
            style={{
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              marginBottom: 16,
            }}
          >
            {formats.map((f, i) => {
              const selected = i === 0; // Employment Hero pre-selected
              return (
                <span
                  key={f}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 11px',
                    borderRadius: 9999,
                    fontFamily: T.fontDisplay,
                    fontSize: 11,
                    fontWeight: 600,
                    border: selected
                      ? `1.5px solid ${T.amber700}`
                      : `1px solid ${T.cream300}`,
                    background: selected ? T.amber100 : '#FFFFFF',
                    color: selected ? T.amber700 : T.charcoal,
                  }}
                >
                  {selected && (
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        background: T.amber700,
                        display: 'inline-block',
                      }}
                    />
                  )}
                  {f}
                </span>
              );
            })}
          </div>

          {/* CSV preview pane */}
          <div
            style={{
              background: '#FFFFFF',
              border: `1px solid ${T.cream300}`,
              borderRadius: 6,
              padding: 0,
              overflow: 'hidden',
            }}
          >
            {/* Header row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.5fr 0.9fr 0.8fr 0.7fr',
                background: T.cream200,
                padding: '8px 12px',
                fontFamily: T.fontMono,
                fontSize: 10,
                fontWeight: 700,
                color: T.charcoal500,
                letterSpacing: '0.04em',
                borderBottom: `1px solid ${T.cream300}`,
              }}
            >
              <span>employee</span>
              <span>date</span>
              <span>hours</span>
              <span>rate</span>
            </div>
            {[
              { e: 'Muniz Campos, J.', d: '27 Apr', h: '8.20', r: '28.47' },
              { e: 'Muniz Campos, J.', d: '28 Apr', h: '7.83', r: '28.47' },
              { e: 'Muniz Campos, J.', d: '29 Apr', h: '8.50', r: '28.47' },
              { e: 'Muniz Campos, J.', d: '30 Apr', h: '8.03', r: '28.47' },
            ].map((row, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.5fr 0.9fr 0.8fr 0.7fr',
                  padding: '7px 12px',
                  fontFamily: T.fontMono,
                  fontSize: 10.5,
                  color: T.charcoal,
                  borderBottom: i < 3 ? `1px solid ${T.cream300}` : 'none',
                }}
              >
                <span>{row.e}</span>
                <span style={{ color: T.charcoal500 }}>{row.d}</span>
                <span>{row.h}</span>
                <span style={{ color: T.charcoal500 }}>{row.r}</span>
              </div>
            ))}
          </div>

          {/* Action row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              marginTop: 16,
            }}
          >
            <div
              style={{
                fontFamily: T.fontMono,
                fontSize: 10,
                color: T.charcoal500,
              }}
            >
              4 shifts · 32.56 verified hours
            </div>
            <div
              style={{
                fontFamily: T.fontDisplay,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                background: T.charcoal,
                color: T.cream,
                padding: '8px 14px',
                borderRadius: 6,
              }}
            >
              Download CSV →
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

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
