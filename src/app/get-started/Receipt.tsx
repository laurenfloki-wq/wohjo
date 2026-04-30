// FLOSTRUCTION receipt mockup — builds itself in front of the customer.
//
// Two craft moves live here:
//   Move 1 — Receipt builds itself: choreographed reveal sequence
//            (card → header → ID → cascading lines → hash chain →
//            Chain Integrity: INTACT pulse → WLES Verified). Plays
//            once on viewport entry, ~4 seconds total. After build,
//            switches to subtle infinite breathing (~4s cycle, 2px
//            translateY amplitude — almost imperceptible "alive").
//   Move 4 — Parallax with cursor: receipt rotates max 3° on
//            rotateX/rotateY tracking cursor over its container.
//            Smooth spring interpolation. Disabled on touch devices
//            (no cursor) and under prefers-reduced-motion.
//
// Reduced-motion: receipt appears in final state immediately, no
// breathing, no parallax. Static fallback is visually complete on its
// own — animation is enhancement, not foundation.
//
// Compositor-thread only: all animations use transform + opacity.
// No layout-triggering properties.

'use client';

import { useRef } from 'react';
import {
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'framer-motion';
import {
  D,
  EASE_OUT_EXPO,
  EASE_OUT_QUART,
  RECEIPT_TIMING,
  acceleratingCharDelays,
} from './motion';

// 2026-04-30 palette repaint to canonical mockup language per
// design-branch/supporting-screens.html. Receipt mockup hosted on the
// /get-started navy surface, but the receipt itself is now a charcoal-800
// raised card matching the rest of the page.
const PALETTE = {
  navySoft:     '#1A1A1C',  // charcoal-800 — receipt card background
  warm:         '#F5F2EA',  // cream — receipt content text
  live:         '#3C7950',  // forest-500 — INTACT/Verified
  green:        '#2D5F3F',  // forest — WLES Verified line
  muted:        'rgba(245,242,234,0.55)',  // cream@55% — receipt label muted
  border:       'rgba(245,242,234,0.10)',
  borderStrong: 'rgba(245,242,234,0.18)',
};

// The fixed final hash that the build sequence resolves to. Synthetic
// — keeps with the FSTR-JK5QPAVQ receipt theme. 8-char SHA-256 prefix
// is the visible representation.
const FINAL_HASH = '7a4f9c1e';

interface ReceiptProps {
  /** When true, defer animation until the parent indicates ready
   *  (e.g. paged transition complete). Optional. */
  delay?: number;
}

export default function Receipt({ delay = 0 }: ReceiptProps) {
  const reduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { once: true, margin: '-80px' });

  // Build-sequence trigger. If reduced-motion, treat as already complete.
  const built = reduced || inView;

  // ── Move 4: cursor parallax ────────────────────────────────────
  // Two motion values for cursor offset within the container; mapped
  // to small rotation deltas. Spring-smoothed so receipt doesn't snap.
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateY = useTransform(mouseX, [-1, 1], [-3, 3]);
  const rotateX = useTransform(mouseY, [-1, 1], [3, -3]);
  const springRotateX = useSpring(rotateX, { stiffness: 80, damping: 20, mass: 0.6 });
  const springRotateY = useSpring(rotateY, { stiffness: 80, damping: 20, mass: 0.6 });

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (reduced) return;
    if (e.pointerType === 'touch') return; // touch devices: no parallax
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const nx = (e.clientX - cx) / (rect.width / 2);
    const ny = (e.clientY - cy) / (rect.height / 2);
    mouseX.set(Math.max(-1, Math.min(1, nx)));
    mouseY.set(Math.max(-1, Math.min(1, ny)));
  }
  function handlePointerLeave() {
    mouseX.set(0);
    mouseY.set(0);
  }

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{
        // Perspective lives on the parent so rotateX/Y reads as 3D.
        perspective: 1200,
        // Reserve space for shadow elevation on hover.
        padding: 8,
      }}
    >
      <motion.div
        className="flo-receipt-card"
        initial={reduced ? false : { opacity: 0, scale: 0.96 }}
        animate={built ? { opacity: 1, scale: 1 } : undefined}
        transition={{
          duration: D.cardMaterialise,
          ease: EASE_OUT_EXPO,
          delay,
        }}
        whileHover={
          reduced
            ? undefined
            : {
                y: -3,
                boxShadow: '0 32px 56px -22px rgba(0,0,0,0.65)',
                transition: { duration: D.hover, ease: EASE_OUT_QUART },
              }
        }
        style={{
          background: PALETTE.navySoft,
          border: `1px solid ${PALETTE.borderStrong}`,
          borderRadius: 8,
          padding: 28,
          color: PALETTE.warm,
          fontFamily: 'var(--font-jetbrains-mono), "JetBrains Mono", ui-monospace, monospace',
          fontSize: 13,
          lineHeight: 1.75,
          boxShadow: '0 24px 40px -20px rgba(0,0,0,0.5)',
          rotateX: reduced ? 0 : springRotateX,
          rotateY: reduced ? 0 : springRotateY,
          transformStyle: 'preserve-3d',
          willChange: 'transform',
        }}
      >
        {/* Card-internal subtle breathing — applied to inner wrapper so
            it composes with parallax rotation on the outer card. Pure
            CSS keyframes, paused under reduced-motion. */}
        <div className={built ? 'flo-receipt-breath' : ''}>
          <FadeIn show={built} delay={delay + RECEIPT_TIMING.header} duration={D.receiptHeader}>
            <div style={{
              color: PALETTE.muted,
              fontSize: 10,
              letterSpacing: '0.18em',
            }}>
              FLOSTRUCTION RECEIPT
            </div>
          </FadeIn>

          <FadeIn show={built} delay={delay + RECEIPT_TIMING.receiptId} duration={D.receiptIdSlide}>
            <div style={{
              color: PALETTE.live,
              fontSize: 22,
              fontWeight: 700,
              marginTop: 6,
              letterSpacing: '0.04em',
            }}>
              FSTR-JK5QPAVQ
            </div>
          </FadeIn>

          <FadeIn show={built} delay={delay + RECEIPT_TIMING.divider1} duration={0.18}>
            <Divider />
          </FadeIn>

          <FadeIn show={built} delay={delay + RECEIPT_TIMING.workerLine} duration={D.cascadeStep}>
            <ReceiptLine k="Worker" v="Steve" />
          </FadeIn>
          <FadeIn show={built} delay={delay + RECEIPT_TIMING.siteLine} duration={D.cascadeStep}>
            <ReceiptLine k="Site" v="Canberra Construction Site" />
          </FadeIn>
          <FadeIn show={built} delay={delay + RECEIPT_TIMING.dateLine} duration={D.cascadeStep}>
            <ReceiptLine k="Date" v="20 April 2026" />
          </FadeIn>

          <FadeIn show={built} delay={delay + RECEIPT_TIMING.divider2} duration={0.18}>
            <Divider />
          </FadeIn>

          <FadeIn show={built} delay={delay + RECEIPT_TIMING.clockIn} duration={D.cascadeStep}>
            <ReceiptLine k="Clock In" v="07:06 AEST (geofence)" />
          </FadeIn>
          <FadeIn show={built} delay={delay + RECEIPT_TIMING.confirmed} duration={D.cascadeStep}>
            <ReceiptLine k="Confirmed" v="07:06 AEST" />
          </FadeIn>
          <FadeIn show={built} delay={delay + RECEIPT_TIMING.clockOut} duration={D.cascadeStep}>
            <ReceiptLine k="Clock Out" v="15:47 AEST" />
          </FadeIn>
          <FadeIn show={built} delay={delay + RECEIPT_TIMING.hours} duration={D.cascadeStep}>
            <ReceiptLine k="Hours" v="8.75" />
          </FadeIn>
          <FadeIn show={built} delay={delay + RECEIPT_TIMING.approved} duration={D.cascadeStep}>
            <ReceiptLine k="Approved" v="16:12 AEST" />
          </FadeIn>

          <FadeIn show={built} delay={delay + RECEIPT_TIMING.divider3} duration={0.18}>
            <Divider />
          </FadeIn>

          {/* Hash-chain build — the moment that matters. SHA-256 prefix
              characters appear in monospace, accelerating into place. */}
          <FadeIn show={built} delay={delay + RECEIPT_TIMING.hashStart - 0.1} duration={0.2}>
            <HashLine
              show={built}
              startDelay={delay + RECEIPT_TIMING.hashStart}
              total={D.hashBuild}
            />
          </FadeIn>

          {/* Chain Integrity: INTACT — single pulse, then static. */}
          <IntactLine show={built} startDelay={delay + RECEIPT_TIMING.intactPulse} />

          {/* WLES v1.0 Verified — green dot + line, lands last. */}
          <FadeIn show={built} delay={delay + RECEIPT_TIMING.wlesVerified} duration={D.finalLand}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: PALETTE.green,
              marginTop: 4,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: PALETTE.green, display: 'inline-block',
              }} />
              <span>WLES v1.0 Verified</span>
            </div>
          </FadeIn>
        </div>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

function FadeIn({
  show, delay, duration, children,
}: {
  show: boolean;
  delay: number;
  duration: number;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={show ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration, delay, ease: EASE_OUT_EXPO }}
    >
      {children}
    </motion.div>
  );
}

function ReceiptLine({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ color: PALETTE.muted }}>{k}</span>
      <span style={{ color: PALETTE.warm }}>{v}</span>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: PALETTE.border, margin: '12px 0' }} />;
}

/**
 * The hash-chain build: SHA-256 prefix appears character-by-character
 * with accelerating timing. Total ~1s.
 */
function HashLine({
  show, startDelay, total,
}: {
  show: boolean;
  startDelay: number;
  total: number;
}) {
  const reduced = useReducedMotion();
  const charDelays = acceleratingCharDelays(FINAL_HASH.length, total);

  if (reduced) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 10,
        marginBottom: 4,
      }}>
        <span style={{ color: PALETTE.muted }}>hash</span>
        <span style={{ color: PALETTE.live, letterSpacing: '0.08em' }}>
          {FINAL_HASH}…
        </span>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: 4,
    }}>
      <span style={{ color: PALETTE.muted }}>hash</span>
      <span style={{
        color: PALETTE.live,
        letterSpacing: '0.08em',
        fontVariantNumeric: 'tabular-nums',
        display: 'inline-flex',
      }}>
        {FINAL_HASH.split('').map((ch, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: -4 }}
            animate={show ? { opacity: 1, y: 0 } : undefined}
            transition={{
              duration: 0.18,
              delay: startDelay + charDelays[i],
              ease: EASE_OUT_QUART,
            }}
          >
            {ch}
          </motion.span>
        ))}
        <motion.span
          initial={{ opacity: 0 }}
          animate={show ? { opacity: 1 } : undefined}
          transition={{ duration: 0.18, delay: startDelay + total + 0.05 }}
        >
          …
        </motion.span>
      </span>
    </div>
  );
}

/**
 * Chain Integrity: INTACT line — appears with a subtle green pulse.
 * Pulse is one cycle of opacity 0 → 0.4 → 1 + scale 0.96 → 1.04 → 1.
 */
function IntactLine({ show, startDelay }: { show: boolean; startDelay: number }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0 }}
      animate={
        show
          ? reduced
            ? { opacity: 1 }
            : { opacity: [0, 0.4, 1], scale: [0.96, 1.03, 1] }
          : undefined
      }
      transition={
        reduced
          ? { duration: 0 }
          : {
              duration: D.pulse,
              delay: startDelay,
              times: [0, 0.45, 1],
              ease: EASE_OUT_EXPO,
            }
      }
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        color: PALETTE.live,
        marginTop: 8,
        willChange: 'transform, opacity',
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: PALETTE.live, display: 'inline-block',
      }} />
      <span>Chain Integrity: INTACT</span>
    </motion.div>
  );
}
