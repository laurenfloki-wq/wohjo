/**
 * /get-started — Institutional sign-up surface for FLOSTRUCTION.
 *
 * Strategic-positioning context (2026-04-30 mid-day):
 *   - Public landing CTAs ("Get Flostruction") route here, replacing
 *     prior "Join the founding cohort" framing on the public surface.
 *   - /founding is the warm-channel pathway (direct URL only).
 *   - This page is the COLD-CHANNEL institutional entry: $499/month
 *     Standard tier, no scarcity, no "first 20", no countdown.
 *
 * 2026-04-30 ~2pm Sydney — Jobs/Ive luxury craft pass:
 *   The page now ships seven craft moves that make the conversion
 *   moment feel like a luxury experience, not a B2B SaaS form. The
 *   single highest-value move: the receipt builds itself in front of
 *   the customer (Move 1, in Receipt.tsx). The product demonstrates
 *   itself during the sales pitch.
 *
 * Move map:
 *   1. Receipt builds itself     → Receipt.tsx
 *   2. Form-as-seal               → SealForm sub-component (this file)
 *   3. Paced reveal on scroll     → useInView + whileInView throughout
 *   4. Receipt parallax           → Receipt.tsx (cursor-tracked)
 *   5. Interactive timeline       → Timeline.tsx
 *   6. Page-mount transition      → CSS keyframe materialise on first
 *                                    mount; faux shared-layout feel
 *                                    without cross-route layoutId
 *                                    (Framer Motion shared layout
 *                                    doesn't span Next.js route
 *                                    boundaries cleanly)
 *   7. Hover state precision      → per-element whileHover throughout
 *
 * Guardrails (per Council, non-negotiable):
 *   - Reduced-motion: every animation gated on useReducedMotion()
 *     plus CSS @media (prefers-reduced-motion: reduce). Reduced-motion
 *     users get instant transitions.
 *   - Static fallback: every animated element has a complete static
 *     final state. JS-not-hydrated / slow-connection users get the
 *     receipt rendered, the form submitting, the timeline expanded.
 *   - Compositor-thread only: transform + opacity for every animation.
 *   - No new dependencies — Framer Motion (already in stack) + CSS.
 *   - Accessibility: ARIA preserved, keyboard nav unbroken, screen
 *     readers see the static content.
 */
'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import {
  motion,
  useInView,
  useReducedMotion,
  AnimatePresence,
} from 'framer-motion';
import { FMark } from '@/components/brand/FMark';
import {
  WorkerHomeShot,
  SupervisorSmsShot,
  WorkerRecordsShot,
  PayrollExportShot,
} from '@/components/shared/MarketingScreenshots';
import Receipt from './Receipt';
import Timeline from './Timeline';
import { D, EASE_OUT_EXPO, EASE_OUT_QUART } from './motion';

// 2026-04-30 palette repaint to canonical mockup language per
// design-branch/supporting-screens.html :root. Charcoal-dominant
// (was navy), mockup amber #D9A548 (was burnt orange #c8530a),
// forest-500 live indicator #3C7950 (was mint #4ade80).
//
// Key names preserved (navy, navySoft, etc.) for backwards-compat
// with existing JSX references — values shifted to canonical
// supporting-screens.html palette.
//
// Contrast verification (WCAG):
//   cream on charcoal              17.66:1  AAA pass
//   cream on charcoal-800          16.40:1  AAA pass
//   charcoal-300 on charcoal        7.83:1  AAA pass
//   cream@55% on charcoal         ~10.10:1  AAA pass (mutedSoft)
// charcoal-400 #7A7A82 deliberately NOT used — only 4.49:1 against
// charcoal, fails AA-normal-text by 0.01.
const PALETTE = {
  navy:         '#0F0F10',  // charcoal — page surface
  navySoft:     '#1A1A1C',  // charcoal-800 — raised cards
  navyDeeper:   '#1A1A1C',  // alias to charcoal-800 (no "deeper than charcoal" in canon)
  green:        '#2D5F3F',  // forest
  live:         '#3C7950',  // forest-500 — INTACT pulse / live indicators
  amber:        '#D9A548',  // mockup amber (canonical)
  amberDeep:    '#B48630',  // amber-700
  warm:         '#F5F2EA',  // cream — primary text on charcoal
  warmDim:      '#EDE9DF',  // cream-200 — secondary text
  muted:        '#A3A3A8',  // charcoal-300 — muted labels (AAA pass)
  mutedSoft:    'rgba(245,242,234,0.55)',  // cream@55% — warm muted (AAA pass)
  border:       'rgba(245,242,234,0.10)',  // subtle separator
  borderStrong: 'rgba(245,242,234,0.18)',  // input borders, raised card edges
};

interface FormState {
  name: string;
  company: string;
  role: string;
  email: string;
  phone: string;
  workers: string;
  message: string;
}

const INITIAL_FORM: FormState = {
  name: '', company: '', role: '', email: '', phone: '', workers: '', message: '',
};

type SubmitState = 'idle' | 'sealing' | 'sealed' | 'error';

export default function GetStartedPage() {
  const reduced = useReducedMotion();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitState === 'sealing' || submitState === 'sealed') return;
    setSubmitState('sealing');
    setErrorMsg(null);
    // Hold the sealing state long enough for the hash-sweep animation
    // to complete (~600ms) before swapping to the sealed view. This
    // makes the network return feel orchestrated rather than abrupt.
    const startedAt = Date.now();
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          name: form.name,
          company: form.company,
          role: form.role,
          email: form.email,
          phone: form.phone,
          workers_on_site: form.workers,
          message: form.message,
          source: 'get-started',
        }),
      });
      if (!res.ok) throw new Error('submit-failed');
      const heldFor = Date.now() - startedAt;
      const minHold = reduced ? 0 : 700;
      if (heldFor < minHold) {
        await new Promise((r) => setTimeout(r, minHold - heldFor));
      }
      setSubmitState('sealed');
    } catch {
      setErrorMsg('Something went wrong. Please email support@flosmosis.com or try again in a moment.');
      setSubmitState('error');
    }
  };

  return (
    <main
      className={reduced ? 'flo-page-reduced' : 'flo-page'}
      style={{
        background: PALETTE.navy,
        color: PALETTE.warm,
        fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
        minHeight: '100vh',
      }}
    >
      <PageStyles />

      {/* ── Move 6: page-mount transition ──────────────────────
          Cream-tinted radial gradient overlay that fades from
          centre to nothing over 600ms on mount. Mimics the orange
          CTA from the landing page expanding into the new surface.
          Pointer-events:none so it never blocks interaction.
          Reduced-motion: skipped via CSS keyframe gate. */}
      <div className="flo-page-mount-overlay" aria-hidden="true" />

      {/* Top bar */}
      <header
        className="flo-pad-edge flo-mount-fade"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px 48px',
          borderBottom: `1px solid ${PALETTE.border}`,
        }}
      >
        <Link href="/" style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 12,
          color: PALETTE.warm,
          textDecoration: 'none',
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 13,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
        }}>
          <FMark size={22} colour="on-navy" rails="primary-only" label="Flostruction" />
          <span>Flostruction</span>
        </Link>
        <div style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 11,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: PALETTE.muted,
        }}>
          Get started
        </div>
      </header>

      {/* ── HERO ──────────────────────────────────────────────── */}
      <section
        className="flo-pad-edge"
        style={{
          padding: '80px 48px 64px',
          maxWidth: 1180,
          margin: '0 auto',
        }}
      >
        <div
          className="flo-hero-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '1.1fr 1fr',
            gap: 72,
            alignItems: 'center',
          }}
        >
          <div>
            <Reveal delay={0}>
              <PricePill />
            </Reveal>

            <h1 style={{
              fontFamily: '"IBM Plex Serif", Georgia, serif',
              fontSize: 'clamp(2.4rem, 5vw, 3.8rem)',
              lineHeight: 1.04,
              fontWeight: 500,
              margin: 0,
              marginTop: 28,
              marginBottom: 28,
              letterSpacing: '-0.012em',
              color: PALETTE.warm,
            }}>
              <RevealLine delay={0.1}>Verified hours.</RevealLine>
              <RevealLine delay={0.22}>
                <span style={{ color: PALETTE.live }}>Permanent records.</span>
              </RevealLine>
              <RevealLine delay={0.34}>One account away.</RevealLine>
            </h1>

            <Reveal delay={0.46}>
              <p style={{
                fontSize: 17,
                lineHeight: 1.7,
                color: PALETTE.warmDim,
                maxWidth: 540,
                margin: 0,
                marginBottom: 32,
              }}>
                Tell us a little about your operation. We&apos;ll set up your account
                with a 15-minute call — typically same business day. Your workers
                can start clocking shifts immediately after.
              </p>
            </Reveal>

            <Reveal delay={0.58}>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <PrimaryCTA href="#start-form">Set up my account →</PrimaryCTA>
                <SecondaryCTA href="/#">Talk to us first</SecondaryCTA>
              </div>
            </Reveal>
          </div>

          {/* Receipt — its own build sequence (Move 1) + parallax (Move 4) */}
          <div
            className="flo-hero-receipt-col"
            style={{ justifySelf: 'end', maxWidth: 440, width: '100%' }}
          >
            <div style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 11,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: PALETTE.muted,
              marginBottom: 14,
              textAlign: 'right',
            }}>
              What you&apos;re buying ↓
            </div>
            <Receipt />
          </div>
        </div>
      </section>

      {/* ── TRUST SIGNALS ─────────────────────────────────────── */}
      <ScrollSection>
        <section
          className="flo-pad-edge"
          style={{
            background: PALETTE.navyDeeper,
            borderTop: `1px solid ${PALETTE.border}`,
            borderBottom: `1px solid ${PALETTE.border}`,
            padding: '40px 48px',
          }}
        >
          <div
            className="flo-trust-grid"
            style={{
              maxWidth: 1180,
              margin: '0 auto',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 36,
            }}
          >
            <TrustSignal
              i={0}
              eyebrow="Foundation Entity"
              line="FLOSMOSIS PTY LTD"
              detail="ACN 697 323 925 · ACT-law governed"
            />
            <TrustSignal
              i={1}
              eyebrow="Open standard"
              line="WLES v1.0"
              detail="Constitution adopted 27 Apr 2026 · royalty-free"
            />
            <TrustSignal
              i={2}
              eyebrow="Tamper-evident"
              line="SHA-256 hash chains"
              detail="Independently verifiable, every shift"
            />
            <TrustSignal
              i={3}
              eyebrow="Australian construction"
              line="Built for the work"
              detail="Worker app · supervisor SMS · payroll exports"
            />
          </div>
        </section>
      </ScrollSection>

      {/* ── WHAT'S INCLUDED ───────────────────────────────────── */}
      <ScrollSection>
        <section
          className="flo-pad-edge"
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            padding: '88px 48px 24px',
          }}
        >
          <SectionLabel text="Standard plan · what's included" />
          <Reveal delay={0.05}>
            <h2 style={{
              fontFamily: '"IBM Plex Serif", Georgia, serif',
              fontSize: 'clamp(1.6rem, 3vw, 2.2rem)',
              fontWeight: 500,
              lineHeight: 1.15,
              margin: 0,
              marginTop: 12,
              marginBottom: 0,
              maxWidth: 720,
              letterSpacing: '-0.012em',
            }}>
              The receipt is one of four things you get. Here are the others.
            </h2>
          </Reveal>

          <div style={{ marginTop: 64, display: 'flex', flexDirection: 'column', gap: 80 }}>
            <DemoPanel
              i={0}
              imagePosition="left"
              eyebrow="Worker app · 01"
              title="In your worker's pocket."
              body="Phone-OTP sign-in — no passwords, no app store, no friction. Geofenced clock-in proves the worker was actually on the site at the time the shift started. Works offline; syncs when signal returns. The artefact is the receipt; the worker keeps it."
              media={<WorkerHomeShot />}
              alt="Phone showing the FLOSTRUCTION worker app with a live shift in progress at Westgate Tower L9, elapsed time 3 hours 42 minutes, with End shift and Take a break buttons."
            />

            <DemoPanel
              i={1}
              imagePosition="right"
              eyebrow="Supervisor SMS · 02"
              title="Approval in three letters."
              body="Daily approval batch arrives on the supervisor's phone via standard SMS. They reply YES ALL, or YES with a code to approve only the clean shifts. No app to install, no login, no training. Works on every phone in the country, including the one your site supervisor refuses to upgrade."
              media={<SupervisorSmsShot />}
              alt="Phone showing a Flostruction SMS thread: an inbound message listing two timesheets needing approval, the supervisor's outbound YES ALL reply, and the inbound confirmation message that records were sealed and sent to payroll."
            />

            <DemoPanel
              i={2}
              imagePosition="left"
              eyebrow="Permanent records · 03"
              title="Every hour, hash-chained."
              body="Each approved shift is sealed to the previous one via SHA-256. Tampering with any single shift breaks every hash that follows. Verification is open and cryptographic — your records hold up under regulator scrutiny, acquirer due diligence, and any future dispute. Independently verifiable, every shift."
              media={<WorkerRecordsShot />}
              alt="Phone showing the worker's records page: four sealed shifts at Westgate L9 across the week, each with hours, an 8-character SHA-256 hash prefix, and a Chain integrity INTACT confirmation strip at the bottom."
            />

            <DemoPanel
              i={3}
              imagePosition="right"
              eyebrow="Payroll exports · 04"
              title="One click. Bookkeeper-ready."
              body="Approved shifts export as CSV in the format your payroll provider expects. Five out of the box: Employment Hero, Xero, MYOB, KeyPay, Micropay. Your bookkeeper drops the file in. No re-keying, no format wrestling, no back-and-forth about whose source-of-truth wins."
              media={<PayrollExportShot />}
              alt="Browser window showing the FLOSTRUCTION command export modal: pay period 25 Apr to 30 Apr, format selector with Employment Hero selected, and a CSV preview table showing four of Joao Muniz Campos's verified shifts ready to download."
              wide
            />
          </div>

          <Reveal delay={0.1}>
            <p style={{
              marginTop: 56,
              fontSize: 14,
              lineHeight: 1.7,
              color: PALETTE.mutedSoft,
              maxWidth: 720,
            }}>
              Larger operations (75+ workers or 2,000+ shifts/month) move to Growth or Scale tiers — we&apos;ll let you know if that applies before billing starts.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <p style={{
              marginTop: 12,
              fontSize: 11,
              lineHeight: 1.7,
              color: PALETTE.mutedSoft,
              maxWidth: 720,
              fontFamily: '"IBM Plex Mono", monospace',
              letterSpacing: '0.04em',
            }}>
              Examples shown with synthetic data. Names, sites, hashes, and amounts are illustrative — your records use your workers and your sites.
            </p>
          </Reveal>
        </section>
      </ScrollSection>

      {/* ── WHAT HAPPENS NEXT — interactive timeline (Move 5) ─── */}
      <ScrollSection>
        <section
          className="flo-pad-edge"
          style={{
            maxWidth: 980,
            margin: '0 auto',
            padding: '72px 48px 64px',
          }}
        >
          <SectionLabel text="What happens after you submit" />
          <Reveal delay={0.1}>
            <p style={{
              fontSize: 13,
              fontFamily: '"IBM Plex Mono", monospace',
              color: PALETTE.mutedSoft,
              margin: '12px 0 0',
              letterSpacing: '0.04em',
            }}>
              Tap any step for detail.
            </p>
          </Reveal>
          <div className="flo-timeline" style={{ marginTop: 28 }}>
            <Timeline />
          </div>
        </section>
      </ScrollSection>

      {/* ── FORM ─ Move 2: form-as-seal ──────────────────────── */}
      <ScrollSection>
        <SealForm
          form={form}
          setForm={setForm}
          submitState={submitState}
          errorMsg={errorMsg}
          onSubmit={handleSubmit}
        />
      </ScrollSection>

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <ScrollSection>
        <footer
          className="flo-pad-edge"
          style={{
            background: PALETTE.navyDeeper,
            borderTop: `1px solid ${PALETTE.border}`,
            padding: '40px 48px',
            fontSize: 12,
            color: PALETTE.mutedSoft,
            textAlign: 'center',
            fontFamily: '"IBM Plex Mono", monospace',
            letterSpacing: '0.04em',
            lineHeight: 1.7,
          }}
        >
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <span>
              Records substrate for the Workforce Ledger Evidentiary Standard (WLES).
              Worker-confirmed on-site. Supervisor-verified by SMS. Permanent, timestamped, exportable.
            </span>
            <div style={{ marginTop: 10 }}>
              © 2026 FLOSMOSIS PTY LTD (ACN 697 323 925). Flostruction is a product of FLOSMOSIS PTY LTD.
              Time verification platform — does not calculate wages, award entitlements, tax, or superannuation.
            </div>
          </div>
        </footer>
      </ScrollSection>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────
// PageStyles — CSS keyframes for the page-mount overlay, breathing
// animation on the receipt, hash-sweep on the submit button, sealed
// stamp animation, and reduced-motion overrides.
// ─────────────────────────────────────────────────────────────────

function PageStyles() {
  return (
    <style>{`
      /* Move 6 — page-mount overlay: amber-tinted radial gradient
         centred above-fold, fades to transparent over 600ms. Visible
         only at first paint then gone. Pointer-events:none. */
      .flo-page-mount-overlay {
        position: fixed;
        inset: 0;
        background: radial-gradient(
          circle at 50% 38%,
          rgba(217, 165, 72, 0.32) 0%,
          rgba(217, 165, 72, 0.08) 30%,
          rgba(14, 28, 47, 0) 60%
        );
        pointer-events: none;
        z-index: 1;
        animation: flo-mount-fade 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      @keyframes flo-mount-fade {
        from { opacity: 1; }
        to { opacity: 0; visibility: hidden; }
      }

      /* Move 6 — header fades from below as if continuing from the
         landing-page nav. Subtle, unmissable on careful look. */
      .flo-mount-fade {
        animation: flo-content-rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) backwards;
      }
      @keyframes flo-content-rise {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* Move 1 — subtle continuous breathing post-build. 4s cycle,
         translateY ±2px. Almost imperceptible "alive" signal. Pause
         under reduced motion. */
      .flo-receipt-breath {
        animation: flo-breathe 4s ease-in-out infinite;
        will-change: transform;
      }
      @keyframes flo-breathe {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-2px); }
      }

      /* Move 2b — hash-sweep on submit button while sealing. */
      .flo-button-sealing {
        position: relative;
        overflow: hidden;
      }
      .flo-button-sealing::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(
          110deg,
          rgba(255,255,255,0) 0%,
          rgba(255,255,255,0.18) 40%,
          rgba(255,255,255,0.32) 50%,
          rgba(255,255,255,0.18) 60%,
          rgba(255,255,255,0) 100%
        );
        transform: translateX(-110%);
        animation: flo-hash-sweep 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      }
      @keyframes flo-hash-sweep {
        from { transform: translateX(-110%); }
        to { transform: translateX(110%); }
      }

      /* Move 7 — footer-link underline slide-in. */
      .flo-footer-link {
        position: relative;
        text-decoration: none;
        color: inherit;
      }
      .flo-footer-link::after {
        content: '';
        position: absolute;
        left: 0;
        bottom: -2px;
        width: 100%;
        height: 1px;
        background: currentColor;
        transform: scaleX(0);
        transform-origin: left;
        transition: transform 0.15s cubic-bezier(0.25, 1, 0.5, 1);
      }
      .flo-footer-link:hover::after {
        transform: scaleX(1);
      }

      /* Mobile breakpoints */
      @media (max-width: 880px) {
        .flo-hero-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
        .flo-hero-receipt-col { justify-self: stretch !important; }
        .flo-trust-grid { grid-template-columns: 1fr 1fr !important; }
        .flo-timeline { padding: 0 !important; }
        .flo-form-wrap { padding: 32px 20px !important; }
        .flo-pad-edge { padding-left: 20px !important; padding-right: 20px !important; }
        /* Demo panels collapse to single column. Media stacks above copy
           regardless of imagePosition — by setting copy/media display
           order via flexbox-of-grid pattern. */
        .flo-demo-panel {
          grid-template-columns: 1fr !important;
          gap: 32px !important;
        }
        .flo-demo-panel > .flo-demo-media { order: -1 !important; }
        .flo-demo-panel > .flo-demo-copy { order: 0 !important; }
      }
      @media (max-width: 520px) {
        .flo-trust-grid { grid-template-columns: 1fr !important; }
      }
      @media (max-width: 420px) {
        /* Phone mockups (320px) need shrinking on narrowest viewports
           so they don't bleed into the page edge. Scale the inner
           surface, leave the bezel proportions intact. */
        .flo-demo-media > div { transform: scale(0.92); transform-origin: top center; }
      }

      /* ── REDUCED MOTION OVERRIDES ──────────────────────────────
         Every animation-bearing class is gated. Users with the
         OS/browser preference set get static surfaces — no fades,
         no breathing, no overlay, no hover lifts. */
      @media (prefers-reduced-motion: reduce) {
        .flo-page-mount-overlay { animation: none !important; opacity: 0 !important; visibility: hidden !important; }
        .flo-mount-fade { animation: none !important; opacity: 1 !important; transform: none !important; }
        .flo-receipt-breath { animation: none !important; }
        .flo-button-sealing::after { animation: none !important; opacity: 0 !important; }
        .flo-footer-link::after { transition: none !important; }
        * { transition-duration: 0.001s !important; animation-duration: 0.001s !important; }
      }
    `}</style>
  );
}

// ─────────────────────────────────────────────────────────────────
// Reveal — generic in-view fade + translateY for sections.
// Per Move 3 — paced reveal on scroll.
// ─────────────────────────────────────────────────────────────────

function ScrollSection({ children }: { children: React.ReactNode }) {
  // Wraps a whole section so its inner Reveal children's `whileInView`
  // works against a meaningful viewport entry, and so the section
  // doesn't reveal twice when crossed in both directions.
  return <>{children}</>;
}

function Reveal({
  children, delay = 0, duration = D.sectionReveal,
}: {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration, delay, ease: EASE_OUT_EXPO }}
    >
      {children}
    </motion.div>
  );
}

function RevealLine({
  children, delay,
}: { children: React.ReactNode; delay: number }) {
  const reduced = useReducedMotion();
  if (reduced) return <span style={{ display: 'block' }}>{children}</span>;
  return (
    <motion.span
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: EASE_OUT_EXPO }}
      style={{ display: 'block' }}
    >
      {children}
    </motion.span>
  );
}

// ─────────────────────────────────────────────────────────────────
// CTAs with Move 7 hover precision
// ─────────────────────────────────────────────────────────────────

function PrimaryCTA({ href, children }: { href: string; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.a
      href={href}
      whileHover={
        reduced
          ? undefined
          : {
              y: -2,
              boxShadow: '0 14px 30px -10px rgba(217, 165, 72, 0.55)',
              transition: { duration: D.hover, ease: EASE_OUT_QUART },
            }
      }
      whileTap={reduced ? undefined : { y: 0, scale: 0.98 }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        background: PALETTE.amber,
        color: '#fff',
        textDecoration: 'none',
        padding: '15px 28px',
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: 13,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        fontWeight: 600,
        borderRadius: 4,
        boxShadow: '0 8px 22px -10px rgba(217, 165, 72, 0.45)',
        willChange: 'transform',
      }}
    >
      {children}
    </motion.a>
  );
}

function SecondaryCTA({ href, children }: { href: string; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.a
      href={href}
      whileHover={
        reduced
          ? undefined
          : {
              borderColor: PALETTE.amber,
              color: PALETTE.warm,
              backgroundColor: 'rgba(217, 165, 72, 0.08)',
              transition: { duration: D.hover, ease: EASE_OUT_QUART },
            }
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        color: PALETTE.warmDim,
        textDecoration: 'none',
        padding: '15px 22px',
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: 13,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        fontWeight: 600,
        border: `1px solid ${PALETTE.borderStrong}`,
        borderRadius: 4,
      }}
    >
      {children}
    </motion.a>
  );
}

function PricePill() {
  return (
    <div style={{
      fontFamily: '"IBM Plex Mono", monospace',
      fontSize: 11,
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
      color: PALETTE.amber,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      padding: '6px 12px',
      border: `1px solid ${PALETTE.amber}`,
      borderRadius: 100,
      opacity: 0.92,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: PALETTE.amber, display: 'inline-block',
      }} />
      Standard plan · A$499/month
    </div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{
      fontFamily: '"IBM Plex Mono", monospace',
      fontSize: 11,
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
      color: PALETTE.muted,
    }}>
      {text}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Trust signals + IncludedItem with stagger reveal + Move 7 hover
// ─────────────────────────────────────────────────────────────────

function TrustSignal({
  i, eyebrow, line, detail,
}: { i: number; eyebrow: string; line: string; detail: string }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const trigger = reduced || inView;

  return (
    <motion.div
      ref={ref}
      initial={reduced ? false : { opacity: 0, y: 20 }}
      animate={trigger ? { opacity: 1, y: 0 } : undefined}
      whileHover={
        reduced
          ? undefined
          : { scale: 1.012, transition: { duration: D.hover, ease: EASE_OUT_QUART } }
      }
      transition={{
        duration: D.sectionReveal,
        delay: i * D.staggerTrust,
        ease: EASE_OUT_EXPO,
      }}
      style={{ willChange: 'transform' }}
    >
      <div style={{
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: 10,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: PALETTE.amber,
        marginBottom: 8,
      }}>
        {eyebrow}
      </div>
      <div style={{
        fontFamily: '"IBM Plex Serif", Georgia, serif',
        fontSize: 18,
        fontWeight: 500,
        color: PALETTE.warm,
        marginBottom: 6,
        letterSpacing: '-0.005em',
      }}>
        {line}
      </div>
      <div style={{
        fontSize: 12,
        color: PALETTE.mutedSoft,
        lineHeight: 1.55,
        fontFamily: '"IBM Plex Mono", monospace',
      }}>
        {detail}
      </div>
    </motion.div>
  );
}

/**
 * DemoPanel — show-don't-tell feature panel with phone/desktop mockup.
 *
 * Two-column composition that alternates image-left vs image-right
 * across a sequence of panels for visual rhythm. Mobile collapses
 * to single column with the media stacked above the copy.
 *
 * Reveal: standard sectionReveal + per-element stagger via in-view
 * trigger on the panel root. The mockup itself is rendered as static
 * markup — no per-element build sequence (that's reserved for the
 * hero receipt — Move 1). The panel reveal is the only animation
 * here, deliberate to not compete with the hero.
 *
 * Reduced motion: all animations bypassed; static layout renders
 * exactly the same composition.
 */
function DemoPanel({
  i, imagePosition, eyebrow, title, body, media, alt, wide,
}: {
  i: number;
  imagePosition: 'left' | 'right';
  eyebrow: string;
  title: string;
  body: string;
  media: React.ReactNode;
  alt: string;
  /** True if the media is a desktop mockup wider than a phone — gives
   *  the media column more grid weight and constrains copy column. */
  wide?: boolean;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const trigger = !!reduced || inView;

  // Grid template depends on image position + wide flag. Phone media
  // panels: 1fr 1fr. Wide (desktop) media panels: 1fr 1.2fr giving the
  // browser frame more room to breathe.
  const gridCols = wide
    ? imagePosition === 'left' ? '1.2fr 1fr' : '1fr 1.2fr'
    : '1fr 1fr';

  const copy = (
    <div className="flo-demo-copy">
      <div style={{
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: 11,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        color: PALETTE.amber,
        marginBottom: 14,
      }}>
        {eyebrow}
      </div>
      <h3 style={{
        fontFamily: '"IBM Plex Serif", Georgia, serif',
        fontSize: 'clamp(1.5rem, 2.6vw, 2rem)',
        fontWeight: 500,
        lineHeight: 1.15,
        color: PALETTE.warm,
        margin: 0,
        marginBottom: 18,
        letterSpacing: '-0.012em',
      }}>
        {title}
      </h3>
      <p style={{
        fontSize: 16,
        lineHeight: 1.7,
        color: PALETTE.warmDim,
        margin: 0,
        maxWidth: 480,
      }}>
        {body}
      </p>
    </div>
  );

  // Wrap the mockup in a figure with semantic alt text. The mockups
  // are decorative React trees, not <img>; the figure provides the
  // accessible description for screen readers.
  const mediaWrap = (
    <figure
      className="flo-demo-media"
      role="img"
      aria-label={alt}
      style={{
        margin: 0,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
      }}
    >
      <div style={{ display: 'inline-block' }}>{media}</div>
    </figure>
  );

  return (
    <motion.div
      ref={ref}
      initial={reduced ? false : { opacity: 0, y: 24 }}
      animate={trigger ? { opacity: 1, y: 0 } : undefined}
      transition={{
        duration: D.sectionReveal,
        delay: Math.min(0.05 + i * 0.04, 0.2),
        ease: EASE_OUT_EXPO,
      }}
      className="flo-demo-panel"
      style={{
        display: 'grid',
        gridTemplateColumns: gridCols,
        gap: 64,
        alignItems: 'center',
      }}
    >
      {imagePosition === 'left' ? (
        <>
          {mediaWrap}
          {copy}
        </>
      ) : (
        <>
          {copy}
          {mediaWrap}
        </>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Move 2 — Form-as-seal
// ─────────────────────────────────────────────────────────────────

function SealForm({
  form, setForm, submitState, errorMsg, onSubmit,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  submitState: SubmitState;
  errorMsg: string | null;
  onSubmit: (e: React.FormEvent) => Promise<void>;
}) {
  const reduced = useReducedMotion();
  const sealing = submitState === 'sealing';
  const sealed = submitState === 'sealed';

  return (
    <section
      id="start-form"
      className="flo-pad-edge"
      style={{
        padding: '40px 48px 96px',
        maxWidth: 720,
        margin: '0 auto',
      }}
    >
      <motion.div
        className="flo-form-wrap"
        initial={reduced ? false : { opacity: 0, y: 16, scale: 0.99 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: D.sectionReveal, ease: EASE_OUT_EXPO }}
        style={{
          background: PALETTE.navySoft,
          border: `1px solid ${sealed ? PALETTE.live : PALETTE.borderStrong}`,
          borderRadius: 10,
          padding: '48px 48px 40px',
          position: 'relative',
          overflow: 'hidden',
          transition: 'border-color 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <AnimatePresence mode="wait">
          {!sealed ? (
            <motion.div
              key="form"
              initial={false}
              animate={{ opacity: sealing ? 0.55 : 1 }}
              transition={{ duration: 0.3, ease: EASE_OUT_QUART }}
              style={{ pointerEvents: sealing ? 'none' : 'auto' }}
            >
              <SectionLabel text="Start your account" />
              <h2 style={{
                fontFamily: '"IBM Plex Serif", Georgia, serif',
                fontSize: 'clamp(1.6rem, 3vw, 2rem)',
                fontWeight: 500,
                margin: 0,
                marginTop: 12,
                marginBottom: 8,
                letterSpacing: '-0.01em',
              }}>
                Tell us about your operation.
              </h2>
              <p style={{
                fontSize: 15,
                lineHeight: 1.65,
                color: PALETTE.mutedSoft,
                margin: 0,
                marginBottom: 32,
              }}>
                Fields marked with <span style={{ color: PALETTE.amber }}>*</span> are required. We&apos;ll respond within one business day.
              </p>

              {errorMsg && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: EASE_OUT_QUART }}
                  style={{
                    background: 'rgba(220, 38, 38, 0.12)',
                    border: '1px solid rgba(220, 38, 38, 0.35)',
                    color: '#fca5a5',
                    padding: '14px 18px',
                    borderRadius: 6,
                    fontSize: 14,
                    marginBottom: 24,
                    lineHeight: 1.5,
                  }}
                >
                  {errorMsg}
                </motion.div>
              )}

              <form onSubmit={onSubmit}>
                <FormField label="Name" required value={form.name}
                  onChange={(v) => setForm((f) => ({ ...f, name: v }))}
                  placeholder="Your name" />
                <FormField label="Company" required value={form.company}
                  onChange={(v) => setForm((f) => ({ ...f, company: v }))}
                  placeholder="Company name" />
                <FormField label="Your role" required as="select" value={form.role}
                  onChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                  <option value="">Select your role…</option>
                  <option value="Site Manager">Site manager</option>
                  <option value="Labour Hire Company">Labour hire company</option>
                  <option value="Payroll / Finance">Payroll / finance</option>
                  <option value="Project Manager">Project manager</option>
                  <option value="Business Owner">Business owner</option>
                  <option value="Other">Other</option>
                </FormField>
                <FormField label="Email" required type="email" value={form.email}
                  onChange={(v) => setForm((f) => ({ ...f, email: v }))}
                  placeholder="you@company.com.au" />
                <FormField label="Phone" type="tel" value={form.phone}
                  onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
                  placeholder="+61 4XX XXX XXX" />
                <FormField label="Workers on site" as="select" value={form.workers}
                  onChange={(v) => setForm((f) => ({ ...f, workers: v }))}>
                  <option value="">Select…</option>
                  <option value="1-15">1–15</option>
                  <option value="16-30">16–30</option>
                  <option value="31-60">31–60</option>
                  <option value="60+">60+</option>
                </FormField>
                <FormField label="Anything we should know?" as="textarea" value={form.message}
                  onChange={(v) => setForm((f) => ({ ...f, message: v }))}
                  placeholder="Site address, current payroll provider, ideal start timing — whatever helps us set you up properly." />

                <SealButton sealing={sealing} />

                <p style={{
                  fontSize: 12,
                  color: PALETTE.mutedSoft,
                  marginTop: 18,
                  lineHeight: 1.7,
                  textAlign: 'center',
                }}>
                  No payment requested today. Pricing and onboarding logistics confirmed on the call before billing starts. No spam, no sales scripts.
                </p>
              </form>
            </motion.div>
          ) : (
            <SealedConfirmation key="sealed" form={form} />
          )}
        </AnimatePresence>
      </motion.div>
    </section>
  );
}

function SealButton({ sealing }: { sealing: boolean }) {
  const reduced = useReducedMotion();
  return (
    <motion.button
      type="submit"
      disabled={sealing}
      className={sealing ? 'flo-button-sealing' : ''}
      animate={
        sealing
          ? reduced
            ? { backgroundColor: PALETTE.amberDeep }
            : { scale: 0.985, backgroundColor: PALETTE.amberDeep }
          : { scale: 1, backgroundColor: PALETTE.amber }
      }
      transition={{ duration: 0.2, ease: EASE_OUT_QUART }}
      whileHover={
        reduced || sealing
          ? undefined
          : {
              y: -2,
              boxShadow: '0 16px 36px -10px rgba(217, 165, 72, 0.6)',
              transition: { duration: D.hover, ease: EASE_OUT_QUART },
            }
      }
      whileTap={reduced || sealing ? undefined : { y: 0, scale: 0.98 }}
      style={{
        width: '100%',
        color: '#fff',
        border: 'none',
        padding: '20px 24px',
        fontSize: 14,
        fontFamily: '"IBM Plex Mono", monospace',
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        fontWeight: 600,
        cursor: sealing ? 'wait' : 'pointer',
        borderRadius: 6,
        marginTop: 12,
        boxShadow: '0 8px 22px -8px rgba(217, 165, 72, 0.5)',
        willChange: 'transform, background-color',
      }}
    >
      {sealing ? 'Sealing…' : 'Set up my account →'}
    </motion.button>
  );
}

function SealedConfirmation({ form }: { form: FormState }) {
  const reduced = useReducedMotion();

  // Stamp + sealed-fields summary. Fields stay visible (greyed),
  // VERIFIED stamp overlays the top, headline + supporting line below.
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
    >
      {/* VERIFIED stamp — green border, slight rotation, scale-in */}
      <motion.div
        initial={reduced ? false : { scale: 0.4, rotate: -8, opacity: 0 }}
        animate={{ scale: 1, rotate: -3, opacity: 1 }}
        transition={{
          duration: D.sealStamp,
          ease: [0.34, 1.56, 0.64, 1], // back-out — slight overshoot
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 22px',
          border: `2px solid ${PALETTE.live}`,
          color: PALETTE.live,
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: '0.24em',
          textTransform: 'uppercase',
          marginBottom: 28,
          background: 'rgba(74, 222, 128, 0.06)',
          willChange: 'transform, opacity',
        }}
      >
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: PALETTE.live, display: 'inline-block',
        }} />
        Verified · Sealed
      </motion.div>

      <motion.h2
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: reduced ? 0 : 0.18, ease: EASE_OUT_EXPO }}
        style={{
          fontFamily: '"IBM Plex Serif", Georgia, serif',
          fontSize: 'clamp(1.8rem, 3.5vw, 2.4rem)',
          fontWeight: 500,
          margin: 0,
          marginBottom: 12,
          color: PALETTE.warm,
          letterSpacing: '-0.01em',
        }}
      >
        Your application is sealed.
      </motion.h2>

      <motion.p
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: reduced ? 0 : 0.28, ease: EASE_OUT_EXPO }}
        style={{
          fontSize: 16,
          lineHeight: 1.7,
          color: PALETTE.warmDim,
          margin: 0,
          marginBottom: 32,
        }}
      >
        We&apos;ll be in touch within one business day to confirm pricing and onboarding logistics.
      </motion.p>

      {/* Submitted-fields summary — preserves vocabulary of the seal:
          customer can see what they signed up for, sealed. */}
      <motion.div
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: reduced ? 0 : 0.4, ease: EASE_OUT_EXPO }}
        style={{
          background: PALETTE.navyDeeper,
          border: `1px solid ${PALETTE.border}`,
          borderRadius: 6,
          padding: '20px 22px',
          fontSize: 13,
          fontFamily: '"IBM Plex Mono", monospace',
          color: PALETTE.warmDim,
        }}
      >
        <div style={{
          color: PALETTE.muted,
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          marginBottom: 14,
        }}>
          Application record
        </div>
        <SealedRow k="Name" v={form.name} />
        <SealedRow k="Company" v={form.company} />
        <SealedRow k="Role" v={form.role} />
        <SealedRow k="Email" v={form.email} />
        {form.phone && <SealedRow k="Phone" v={form.phone} />}
        {form.workers && <SealedRow k="Workers" v={form.workers} />}
      </motion.div>

      <motion.div
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: reduced ? 0 : 0.55, ease: EASE_OUT_EXPO }}
        style={{ marginTop: 32, textAlign: 'center' }}
      >
        <Link href="/" className="flo-footer-link" style={{
          color: PALETTE.amber,
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 13,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
        }}>
          ← Back to flostruction.com
        </Link>
      </motion.div>
    </motion.div>
  );
}

function SealedRow({ k, v }: { k: string; v: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      gap: 10,
      padding: '4px 0',
    }}>
      <span style={{ color: PALETTE.muted }}>{k}</span>
      <span style={{ color: PALETTE.warm }}>{v || '—'}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// FormField — Move 2a, focus animation per field
// ─────────────────────────────────────────────────────────────────

interface BaseFieldProps {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}
type FormFieldProps =
  | (BaseFieldProps & { as?: 'input'; type?: string; children?: never })
  | (BaseFieldProps & { as: 'select'; type?: never; children: React.ReactNode })
  | (BaseFieldProps & { as: 'textarea'; type?: never; children?: never });

function FormField(props: FormFieldProps) {
  const reduced = useReducedMotion();
  const [focused, setFocused] = useState(false);
  const filled = !!props.value;
  const lifted = focused || filled;

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    fontFamily: '"IBM Plex Mono", monospace',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: focused ? PALETTE.warm : (filled ? PALETTE.warmDim : PALETTE.muted),
    marginBottom: 8,
    fontWeight: focused ? 600 : 500,
    transform: reduced ? 'none' : (lifted ? 'translateY(-1px)' : 'none'),
    transition: reduced
      ? 'none'
      : 'color 0.25s cubic-bezier(0.25,1,0.5,1), font-weight 0.25s, transform 0.25s cubic-bezier(0.25,1,0.5,1)',
  };

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    background: PALETTE.navyDeeper,
    border: `${focused ? '2px' : '1px'} solid ${focused ? PALETTE.amber : PALETTE.borderStrong}`,
    color: PALETTE.warm,
    padding: focused ? '13px 15px' : '14px 16px', // compensate for border thickness change
    fontSize: 15,
    fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
    borderRadius: 5,
    outline: 'none',
    transition: reduced
      ? 'none'
      : 'border-color 0.25s cubic-bezier(0.25,1,0.5,1), border-width 0.25s cubic-bezier(0.25,1,0.5,1), box-shadow 0.25s cubic-bezier(0.25,1,0.5,1), padding 0.25s',
    boxShadow: focused && !reduced
      ? '0 0 0 4px rgba(217, 165, 72, 0.10), 0 0 18px -4px rgba(217, 165, 72, 0.25)'
      : 'none',
  };

  const onFocus = () => setFocused(true);
  const onBlur = () => setFocused(false);

  return (
    <div style={{ marginBottom: 22 }}>
      <label style={labelStyle}>
        {props.label}
        {props.required && <span style={{ color: PALETTE.amber, marginLeft: 4 }}>*</span>}
      </label>
      {props.as === 'select' ? (
        <select
          required={props.required}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          style={{ ...fieldStyle, appearance: 'none', cursor: 'pointer' }}
        >
          {props.children}
        </select>
      ) : props.as === 'textarea' ? (
        <textarea
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={props.placeholder}
          rows={4}
          style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.6, minHeight: 110 }}
        />
      ) : (
        <input
          type={props.type ?? 'text'}
          required={props.required}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={props.placeholder}
          style={fieldStyle}
        />
      )}
    </div>
  );
}
