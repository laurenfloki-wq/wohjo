'use client';

import { useState, useEffect, useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap, ScrollTrigger, MM } from '@/lib/motion/gsap-client';
import { PhoneFrame, MarketingScreenshots } from './MarketingScreenshots';
import SealPlayer from './marketing/SealPlayer';
import { landingTokens as C, landingRootVars } from '@/styles/landing-tokens';

// Flostruction landing page — best-in-class makeover (2026-06).
// Trust-first, evidentiary B2B for Australian construction labour hire.
// Single GSAP engine (no second animation lib on this surface). Tokens
// come from src/styles/landing-tokens.ts (shared with the Remotion seal
// demo). Compliance copy is preserved verbatim; every CTA routes to a
// real flow (the contact dialog / /get-started). No fabricated metrics,
// logos, testimonials, or trial flow. See flosmosis-landing-makeover-brief.md.

interface FormData {
  name: string;
  company: string;
  role: string;
  email: string;
  phone: string;
  workers: string;
  payrollSystem: string;
  message: string;
}

const INITIAL_FORM: FormData = {
  name: '',
  company: '',
  role: '',
  email: '',
  phone: '',
  workers: '',
  payrollSystem: '',
  message: '',
};

// Construction imagery only (founder direction). Used by the persona rows.
const PHOTOS = {
  worker: 'photo-1541888946425-d81bb19240f5',
  manager: 'photo-1503387762-592deb58ef4e',
  hire: 'photo-1486406146926-c627a92ad1ab',
};
const img = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&q=80&w=1400`;

// Social-proof metrics ship EMPTY until they are real (§5). When real
// numbers exist, populate this array and the row renders them; until
// then the trust section shows honest credibility only — never a
// placeholder count.
const SOCIAL_PROOF: { value: string; label: string }[] = [];

// Compliance copy held as single-line literals so it is preserved verbatim
// and stays grep-verifiable (JSX text nodes would otherwise be line-wrapped
// by the formatter). Do not alter these strings.
const SCOPE_STATEMENT =
  'Flostruction is a workforce time verification platform. It does not calculate wages, award entitlements, tax, or superannuation.';
const FOOTER_WLES_LINE =
  'Records substrate for the Workforce Ledger Evidentiary Standard (WLES). Worker-confirmed on-site. Supervisor-verified by SMS. Permanent, timestamped, exportable.';
const FOOTER_ENTITY =
  '© 2026 FLOSMOSIS PTY LTD (ACN 697 323 925). Flostruction is a product of FLOSMOSIS PTY LTD.';

// Static, in-context hero artifact — a sealed receipt in a device frame.
// Deliberately NOT the scroll-scrubbed ReceiptShot (whose start-state is
// blank) and NOT a Player (kept out of the hero for LCP). Synthetic data.
function HeroReceipt() {
  return (
    <PhoneFrame height={560}>
      <div
        style={{
          flex: 1,
          background: C.paper,
          padding: '18px 18px 22px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            background: C.surface,
            borderRadius: 12,
            padding: '22px 18px 20px',
            textAlign: 'center',
            boxShadow: '0 1px 2px rgba(15,15,16,0.06), 0 10px 26px -14px rgba(15,15,16,0.20)',
          }}
        >
          <div
            aria-hidden="true"
            style={{ position: 'absolute', top: 12, right: 12, transform: 'rotate(-8deg)' }}
          >
            <svg viewBox="0 0 96 96" width={58} height={58}>
              <circle
                cx="48"
                cy="48"
                r="42"
                fill="none"
                stroke={C.verifiedBright}
                strokeWidth="2"
              />
              <circle
                cx="48"
                cy="48"
                r="36"
                fill="none"
                stroke={C.verifiedBright}
                strokeWidth="1"
              />
              <text
                x="48"
                y="46"
                fontFamily="var(--font-barlow-condensed)"
                fontWeight="700"
                fontSize="13"
                fill={C.verifiedBright}
                textAnchor="middle"
              >
                SEALED
              </text>
              <line x1="32" y1="51" x2="64" y2="51" stroke={C.verifiedBright} strokeWidth="0.8" />
              <text
                x="48"
                y="62"
                fontFamily="var(--font-jetbrains-mono)"
                fontWeight="600"
                fontSize="6"
                fill={C.verifiedBright}
                textAnchor="middle"
              >
                23 APR 2026
              </text>
              <text
                x="48"
                y="78"
                fontFamily="var(--font-barlow-condensed)"
                fontWeight="600"
                fontSize="5"
                fill={C.verifiedBright}
                textAnchor="middle"
                letterSpacing="1"
              >
                WLES v1.0
              </text>
            </svg>
          </div>
          <div
            style={{
              fontFamily: 'var(--font-barlow-condensed)',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: C.muted,
              marginBottom: 6,
            }}
          >
            FLOSTRUCTION
          </div>
          <div
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 13,
              letterSpacing: '0.08em',
              color: C.ink,
              marginBottom: 14,
            }}
          >
            FSTR-7P2K9Q
          </div>
          <div
            style={{
              fontFamily: 'var(--font-barlow-condensed)',
              fontSize: 34,
              fontWeight: 700,
              color: C.ink,
              lineHeight: 1,
              marginBottom: 8,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            8 h 2 m
          </div>
          <div
            style={{
              fontFamily: 'var(--font-barlow-condensed)',
              fontSize: 15,
              fontWeight: 600,
              color: C.ink,
            }}
          >
            Sample Worker
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Westgate Tower · L9</div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>
            Thu 23 Apr 2026 · 07:00 — 15:32
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              marginTop: 14,
              padding: '5px 11px',
              borderRadius: 9999,
              background: C.forestSoft,
              color: C.forest,
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
        </div>
        <div
          style={{
            marginTop: 'auto',
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 8,
            color: C.muted,
            wordBreak: 'break-all',
            lineHeight: 1.4,
            padding: '14px 6px 0',
          }}
        >
          a3b5c7d2f819e4b0c1d23a4f5e6b789c
          <br />
          0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a
        </div>
      </div>
    </PhoneFrame>
  );
}

export default function LandingPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  // Modal keyboard handling — Escape closes; Tab trapped while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setModalOpen(false);
        return;
      }
      if (e.key !== 'Tab' || !modalOpen || !modalRef.current) return;
      const f = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modalOpen]);

  // Focus into the dialog on open; restore to the trigger on close.
  useEffect(() => {
    if (modalOpen) {
      lastFocusedRef.current = document.activeElement as HTMLElement | null;
      modalRef.current
        ?.querySelector<HTMLElement>('input, select, textarea, button, a[href]')
        ?.focus();
    } else {
      lastFocusedRef.current?.focus?.();
    }
  }, [modalOpen]);

  useEffect(() => {
    document.body.style.overflow = modalOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [modalOpen]);

  // Single GSAP engine. Header solid-on-scroll (a state toggle, runs in
  // every tier). Reveals are short, once-only, transform/opacity, and
  // only install outside the reduced-motion tier.
  useGSAP(
    () => {
      const root = pageRef.current;
      if (!root) return;

      const headerTrigger = ScrollTrigger.create({
        start: 40,
        end: 99999,
        onEnter: () => setHeaderScrolled(true),
        onLeaveBack: () => setHeaderScrolled(false),
      });

      const mm = gsap.matchMedia();
      mm.add({ isFull: MM.full, isMobile: MM.mobile, isReduced: MM.reduced }, (ctx) => {
        const { isReduced } = ctx.conditions as {
          isFull: boolean;
          isMobile: boolean;
          isReduced: boolean;
        };
        if (isReduced) return;
        const items = gsap.utils.toArray<HTMLElement>('[data-reveal]', root);
        items.forEach((el) => {
          gsap.from(el, {
            y: 16,
            opacity: 0,
            duration: 0.5,
            ease: 'power2.out',
            scrollTrigger: { trigger: el, start: 'top 88%', once: true },
          });
        });
        const groups = gsap.utils.toArray<HTMLElement>('[data-reveal-group]', root);
        groups.forEach((group) => {
          const kids = Array.from(group.children) as HTMLElement[];
          gsap.from(kids, {
            y: 20,
            opacity: 0,
            duration: 0.5,
            stagger: 0.09,
            ease: 'power2.out',
            scrollTrigger: { trigger: group, start: 'top 85%', once: true },
          });
        });
      });

      return () => {
        headerTrigger.kill();
        mm.revert();
      };
    },
    { scope: pageRef },
  );

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  const openModal = () => setModalOpen(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(false);
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
          payroll_system: form.payrollSystem,
          message: form.message,
        }),
      });
      if (res.ok) setSubmitted(true);
      else throw new Error('Non-OK');
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div ref={pageRef} className="lp">
      <style>{`
        :root {${landingRootVars}}

        .lp { font-family: var(--font-barlow), 'Barlow', -apple-system, BlinkMacSystemFont, sans-serif; color: var(--ink); background: var(--paper); -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; font-optical-sizing: auto; text-rendering: optimizeLegibility; }
        .lp *, .lp *::before, .lp *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .lp :focus-visible { outline: 2px solid var(--signal); outline-offset: 2px; border-radius: 2px; }
        @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }

        /* ── Typography primitives ── */
        .display { font-family: var(--font-barlow-condensed), 'Barlow Condensed', sans-serif; }
        .eyebrow { font-size: var(--step--1); font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--signal); }
        .h1 { font-family: var(--font-barlow-condensed), 'Barlow Condensed', sans-serif; font-size: var(--step-5); font-weight: 800; line-height: 1.02; letter-spacing: -0.02em; text-transform: uppercase; text-wrap: balance; }
        .h2 { font-family: var(--font-barlow-condensed), 'Barlow Condensed', sans-serif; font-size: var(--step-3); font-weight: 800; line-height: 1.05; letter-spacing: -0.01em; text-transform: uppercase; text-wrap: balance; }
        .h3 { font-family: var(--font-barlow-condensed), 'Barlow Condensed', sans-serif; font-size: var(--step-1); font-weight: 700; line-height: 1.15; }
        .lead { font-size: var(--step-1); line-height: 1.5; color: var(--muted); max-width: var(--measure); text-wrap: pretty; }
        .body { font-size: var(--step-0); line-height: 1.7; color: var(--muted); text-wrap: pretty; }

        /* ── Sections ── */
        .section { padding: var(--space-section) var(--gutter); }
        .section--ink { background: var(--ink); color: #fff; }
        .section--paper { background: var(--paper); color: var(--ink); }
        .section--surface { background: #fff; color: var(--ink); }
        .section--ink .body, .section--ink .lead { color: var(--muted-dark); }
        .section--ink .eyebrow { color: var(--verified); }
        .wrap { max-width: var(--maxw); margin: 0 auto; }
        .center { text-align: center; }
        .center .lead, .center .body { margin-left: auto; margin-right: auto; }
        .section-head { max-width: 760px; margin: 0 auto var(--space-block); }

        /* ── Buttons ── */
        .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-family: var(--font-barlow-condensed), 'Barlow Condensed', sans-serif; font-size: 0.98rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 14px 28px; border-radius: 10px; cursor: pointer; min-height: 50px; border: 1.5px solid transparent; text-decoration: none; transition: background 0.2s, color 0.2s, border-color 0.2s, transform 0.1s; }
        .btn-signal { background: var(--signal); color: #fff; }
        .btn-signal:hover { background: var(--signal-hover); }
        .btn-ghost { background: transparent; color: var(--ink); border-color: var(--border); }
        .btn-ghost:hover { border-color: var(--ink); }
        .btn-ghost-dark { background: transparent; color: #fff; border-color: rgba(255,255,255,0.28); }
        .btn-ghost-dark:hover { border-color: rgba(255,255,255,0.6); }
        .btn:active { transform: translateY(1px); }
        .btn-quiet { background: none; border: none; font-family: var(--font-barlow), sans-serif; font-size: 0.92rem; font-weight: 500; letter-spacing: 0.02em; color: inherit; cursor: pointer; min-height: auto; padding: 6px 4px; opacity: 0.82; }
        .btn-quiet:hover { opacity: 1; }
        @media (prefers-reduced-motion: reduce) { .btn { transition: none; } .btn:active { transform: none; } }

        /* ── Announcement + scope strip ── */
        .ann { background: var(--signal); color: #fff; text-align: center; padding: 9px 24px; font-size: 0.82rem; font-weight: 500; letter-spacing: 0.01em; }
        .ann .ann-link { background: none; border: none; color: #fff; font: inherit; font-weight: 700; margin-left: 6px; padding: 0; min-height: auto; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
        .scope { background: var(--surface); color: var(--muted); text-align: center; padding: 10px 24px; font-size: 0.8rem; letter-spacing: 0.01em; border-bottom: 1px solid var(--border); }

        /* ── Header ── */
        .lp-header { position: sticky; top: 0; z-index: 90; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 0 var(--gutter); height: 66px; background: transparent; border-bottom: 1px solid transparent; transition: background 0.3s, border-color 0.3s; }
        .lp-header.scrolled { background: rgba(14,12,9,0.92); backdrop-filter: blur(8px); border-bottom-color: var(--border-dark); }
        .lp-header .brand-logo { font-family: var(--font-barlow-condensed), sans-serif; font-size: 1.3rem; font-weight: 800; letter-spacing: 0.12em; color: #fff; text-transform: uppercase; line-height: 1; }
        .lp-header .brand-sub { font-size: 0.6rem; font-weight: 400; letter-spacing: 0.18em; color: rgba(255,255,255,0.45); text-transform: uppercase; margin-top: 2px; }
        .lp-header nav { display: flex; align-items: center; gap: 28px; }
        .lp-header nav a { color: rgba(255,255,255,0.7); text-decoration: none; font-size: 0.88rem; font-weight: 500; letter-spacing: 0.02em; transition: color 0.2s; }
        .lp-header nav a:hover { color: #fff; }
        .header-cta { display: flex; align-items: center; gap: 12px; }
        .header-cta .btn-quiet { color: rgba(255,255,255,0.78); }
        .header-cta .btn-signal { padding: 10px 20px; min-height: 42px; font-size: 0.9rem; }
        .header-brand { cursor: pointer; }
        @media (max-width: 860px) { .lp-header nav { display: none; } .header-cta .btn-quiet { display: none; } }

        /* ── Hero ── */
        .hero { background: var(--ink); color: #fff; position: relative; overflow: hidden; padding: clamp(40px, 7vw, 84px) var(--gutter) var(--space-section); }
        .hero::before { content: ''; position: absolute; inset: 0; background: radial-gradient(1100px 540px at 78% 18%, rgba(200,83,10,0.16), transparent 60%); pointer-events: none; }
        .hero-grid { position: relative; display: grid; grid-template-columns: 1.08fr 0.92fr; gap: clamp(32px, 5vw, 72px); align-items: center; max-width: var(--maxw); margin: 0 auto; }
        .hero-eyebrow { color: rgba(255,255,255,0.5); margin-bottom: 22px; }
        .hero h1 { color: #fff; margin-bottom: 22px; }
        .hero h1 .accent { color: var(--signal); }
        .hero-sub { font-size: var(--step-1); line-height: 1.55; color: rgba(255,255,255,0.74); max-width: 36ch; text-wrap: pretty; margin-bottom: 30px; }
        .hero-ctas { display: flex; gap: 14px; flex-wrap: wrap; }
        .hero-trust { margin-top: 24px; font-size: 0.84rem; letter-spacing: 0.02em; color: rgba(255,255,255,0.5); }
        .hero-art { display: flex; justify-content: center; }
        @media (max-width: 900px) { .hero-grid { grid-template-columns: 1fr; } .hero-art { order: -1; } }

        /* ── Cost of unverified hours ── */
        .cost-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 28px; }
        .cost-item { border-top: 2px solid var(--signal); padding-top: 16px; }
        .cost-item .ci-head { display: block; font-family: var(--font-barlow-condensed), sans-serif; font-size: 1.3rem; font-weight: 700; line-height: 1.15; color: var(--ink); margin-bottom: 8px; }
        .cost-note { margin-top: var(--space-block); font-size: var(--step-1); line-height: 1.5; color: var(--ink); max-width: var(--measure); text-wrap: pretty; }
        .cost-note strong { color: var(--signal); }

        /* ── How it works (three steps) ── */
        .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: clamp(24px, 4vw, 52px); position: relative; }
        .step-line { position: absolute; top: 22px; left: 12%; right: 12%; height: 2px; background: var(--border); z-index: 0; }
        .step { position: relative; z-index: 1; }
        .step .step-num { width: 44px; height: 44px; border-radius: 50%; background: var(--ink); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-family: var(--font-barlow-condensed), sans-serif; font-weight: 700; font-size: 1.1rem; margin-bottom: 18px; }
        .step h3 { margin-bottom: 10px; }
        @media (max-width: 760px) { .steps { grid-template-columns: 1fr; } .step-line { display: none; } }

        /* ── The standard (WLES) + seal demo ── */
        .standard-grid { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(32px, 5vw, 64px); align-items: center; }
        .standard-points { display: grid; gap: 14px; margin-top: 26px; }
        .standard-point { display: flex; gap: 12px; align-items: flex-start; font-size: var(--step-0); line-height: 1.5; color: var(--muted-dark); }
        .standard-point svg { flex-shrink: 0; margin-top: 3px; color: var(--verified); }
        .standard-caption { margin-top: 16px; font-size: 0.8rem; color: rgba(255,255,255,0.45); text-align: center; max-width: 460px; margin-left: auto; margin-right: auto; }
        @media (max-width: 880px) { .standard-grid { grid-template-columns: 1fr; } }

        /* ── Labour-hire value ── */
        .value-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(244px, 1fr)); gap: 22px; }
        .value-card { background: #fff; border: 1px solid var(--border); border-radius: var(--radius); padding: 30px 28px; box-shadow: 0 1px 3px rgba(26,20,16,0.05), 0 12px 30px -16px rgba(26,20,16,0.12); }
        .value-card h3 { margin-bottom: 12px; }

        /* ── Personas ── */
        .persona { display: grid; grid-template-columns: 0.85fr 1.15fr; gap: clamp(24px, 4vw, 56px); align-items: center; margin-bottom: var(--space-block); }
        .persona:last-child { margin-bottom: 0; }
        .persona-photo { aspect-ratio: 4 / 3; border-radius: var(--radius); background-size: cover; background-position: center; box-shadow: 0 18px 44px -20px rgba(15,15,16,0.45); }
        .persona-label { margin-bottom: 12px; }
        .persona h3 { font-size: var(--step-2); margin-bottom: 14px; }
        .persona .body { margin-bottom: 22px; }
        .persona.rev .persona-photo { order: 2; }
        @media (max-width: 820px) { .persona { grid-template-columns: 1fr; } .persona.rev .persona-photo { order: 0; } }

        /* ── Trust / credibility ── */
        .metrics-row { display: flex; gap: 48px; justify-content: center; flex-wrap: wrap; margin-bottom: var(--space-block); }
        .metric { text-align: center; }
        .metric .m-val { font-family: var(--font-barlow-condensed), sans-serif; font-size: var(--step-3); font-weight: 800; color: var(--signal); line-height: 1; }
        .metric .m-label { font-size: 0.85rem; color: var(--muted); margin-top: 6px; }
        .trust-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(228px, 1fr)); gap: 20px; }
        .trust-card { border: 1px solid var(--border); border-radius: var(--radius); padding: 26px 24px; background: #fff; box-shadow: 0 1px 3px rgba(26,20,16,0.05), 0 12px 30px -16px rgba(26,20,16,0.10); }
        .trust-card h3 { font-size: 1.15rem; color: var(--ink); margin-bottom: 10px; }
        .trust-card p { font-size: 0.9rem; line-height: 1.55; color: var(--muted); }
        .trust-card .tc-cta { margin-top: 14px; }

        /* ── Payday Super (regulatory band) ── */
        .payday-card { max-width: 720px; margin: 0 auto; text-align: center; }
        .payday-card .pd-date { color: var(--signal); }
        .payday-card .pd-body { margin: 0 auto 18px; }
        .payday-card .pd-fine { font-size: 0.85rem; color: rgba(255,255,255,0.5); max-width: 560px; margin: 18px auto 28px; line-height: 1.6; }

        /* ── Final CTA ── */
        .final-ctas { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; margin-top: 8px; }

        /* ── Footer ── */
        .lp-footer { background: var(--ink); border-top: 1px solid var(--border-dark); padding: 48px var(--gutter); display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
        .lp-footer .f-logo { font-family: var(--font-barlow-condensed), sans-serif; font-size: 1.1rem; font-weight: 800; letter-spacing: 0.12em; color: #fff; text-transform: uppercase; }
        .lp-footer .f-sub { font-size: 0.75rem; color: rgba(255,255,255,0.4); margin-top: 4px; }
        .lp-footer .f-fine { font-size: 0.7rem; color: rgba(255,255,255,0.32); margin-top: 10px; max-width: 520px; line-height: 1.6; }
        .lp-footer .f-links { display: flex; gap: 22px; }
        .lp-footer .f-links a { color: rgba(255,255,255,0.5); text-decoration: none; font-size: 0.85rem; }
        .lp-footer .f-links a:hover { color: rgba(255,255,255,0.8); }

        /* ── Modal ── */
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 24px; opacity: 0; pointer-events: none; transition: opacity 0.25s; backdrop-filter: blur(4px); }
        .modal-overlay.open { opacity: 1; pointer-events: all; }
        .modal-box { background: #fff; border-radius: 12px; max-width: 600px; width: 100%; max-height: 90vh; overflow-y: auto; }
        .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 26px 30px 18px; border-bottom: 1px solid #eee; }
        .modal-header h2 { font-family: var(--font-barlow-condensed), sans-serif; font-size: 1.4rem; font-weight: 700; color: var(--ink); letter-spacing: 0.02em; text-transform: uppercase; }
        .modal-close { background: none; border: none; cursor: pointer; color: #999; font-size: 1.5rem; line-height: 1; min-height: auto; padding: 4px 8px; }
        .modal-close:hover { color: var(--ink); }
        .modal-body { padding: 26px 30px 34px; }
        .modal-intro { font-size: 0.9rem; color: #666; line-height: 1.65; margin-bottom: 22px; }
        .modal-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 12px 16px; color: #b91c1c; font-size: 0.875rem; margin-bottom: 20px; }
        .form-row { margin-bottom: 18px; }
        .form-row label { display: block; font-size: 0.8rem; font-weight: 600; color: var(--ink); margin-bottom: 6px; letter-spacing: 0.03em; text-transform: uppercase; }
        .form-row label span { color: var(--signal); }
        .form-row input, .form-row select, .form-row textarea { width: 100%; border: 1.5px solid #e5e7eb; border-radius: 6px; padding: 11px 14px; font-size: 0.95rem; font-family: var(--font-barlow), sans-serif; color: var(--ink); background: #fff; outline: none; transition: border-color 0.2s; min-height: 44px; }
        .form-row input:focus, .form-row select:focus, .form-row textarea:focus { border-color: var(--signal); }
        .form-row textarea { min-height: 90px; resize: vertical; line-height: 1.6; }
        .form-submit { width: 100%; background: var(--signal); color: #fff; border: none; padding: 16px; border-radius: 6px; font-family: var(--font-barlow-condensed), sans-serif; font-size: 1rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; cursor: pointer; min-height: 52px; margin-top: 6px; }
        .form-submit:hover:not(:disabled) { background: var(--signal-hover); }
        .form-submit:disabled { opacity: 0.55; cursor: not-allowed; }
        .form-fine { font-size: 0.78rem; color: #999; text-align: center; margin-top: 12px; line-height: 1.5; }
        .success { text-align: center; padding: 24px 0; }
        .success h3 { font-family: var(--font-barlow-condensed), sans-serif; font-size: 1.4rem; font-weight: 700; letter-spacing: 0.06em; color: var(--ink); margin-bottom: 10px; text-transform: uppercase; }
        .success p { font-size: 0.9rem; color: var(--muted); line-height: 1.6; }
        .success a { color: var(--signal); }
      `}</style>

      {/* Announcement — regulatory urgency, links to the Payday Super section */}
      <div className="ann">
        <span style={{ fontWeight: 700 }}>Payday Super starts 1 July 2026</span> — are your hour
        records verified and ready?
        <button type="button" className="ann-link" onClick={() => scrollTo('payday')}>
          Learn more
        </button>
      </div>

      {/* Scope strip — compliance, verbatim */}
      <div className="scope">{SCOPE_STATEMENT}</div>

      {/* Header */}
      <header className={`lp-header${headerScrolled ? ' scrolled' : ''}`}>
        <div
          className="header-brand"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <div className="brand-logo">Flostruction</div>
          <div className="brand-sub">Time Verification</div>
        </div>
        <nav aria-label="Primary">
          <a
            href="#how"
            onClick={(e) => {
              e.preventDefault();
              scrollTo('how');
            }}
          >
            How it works
          </a>
          <a
            href="#standard"
            onClick={(e) => {
              e.preventDefault();
              scrollTo('standard');
            }}
          >
            The standard
          </a>
          <a
            href="#labour-hire"
            onClick={(e) => {
              e.preventDefault();
              scrollTo('labour-hire');
            }}
          >
            For labour hire
          </a>
        </nav>
        <div className="header-cta">
          <button type="button" className="btn-quiet" onClick={openModal}>
            Talk to us
          </button>
          <button type="button" className="btn btn-signal" onClick={openModal}>
            Book a demo
          </button>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        {/* Hero — two-layer: outcome H1, differentiator subhead, real CTAs */}
        <section className="hero" id="top">
          <div className="hero-grid">
            <div className="hero-copy">
              <div className="eyebrow hero-eyebrow">Time verification for construction</div>
              <h1 className="h1">
                Stop timesheet disputes
                <br />
                <span className="accent">before they start.</span>
              </h1>
              <p className="hero-sub">
                Flostruction verifies every hour at the point of work and seals it into a permanent,
                tamper-evident record. Built for Australian construction and labour hire.
              </p>
              <div className="hero-ctas">
                <button type="button" className="btn btn-signal" onClick={openModal}>
                  Book a demo
                </button>
                <button
                  type="button"
                  className="btn btn-ghost-dark"
                  onClick={() => scrollTo('how')}
                >
                  See how it works
                </button>
              </div>
              <div className="hero-trust">
                Private beta · Australian construction &amp; labour hire
              </div>
            </div>
            <div className="hero-art">
              <HeroReceipt />
            </div>
          </div>
        </section>

        {/* Cost of unverified hours (§4.2) — activate the problem */}
        <section className="section section--paper" id="cost">
          <div className="wrap">
            <div className="section-head center" data-reveal>
              <div className="eyebrow" style={{ marginBottom: 16 }}>
                The problem
              </div>
              <h2 className="h2">When hours aren&apos;t verified, everyone pays for it</h2>
            </div>
            <div className="cost-grid" data-reveal-group>
              <div className="cost-item">
                <span className="ci-head">Paper timesheets nobody trusts</span>
                <p className="body">
                  Numbers written down by hand, questioned by everyone, backed by nothing.
                </p>
              </div>
              <div className="cost-item">
                <span className="ci-head">Approvals that vanish into WhatsApp</span>
                <p className="body">
                  A thumbs-up in a thread that no one can find when the invoice is disputed.
                </p>
              </div>
              <div className="cost-item">
                <span className="ci-head">Disputes that strain client relationships</span>
                <p className="body">
                  Hours argued line by line, every pay run, because no record settles it.
                </p>
              </div>
              <div className="cost-item">
                <span className="ci-head">Missing records when Fair Work asks</span>
                <p className="body">Requests for evidence met with a reconstruction from memory.</p>
              </div>
              <div className="cost-item">
                <span className="ci-head">Admin hours lost to chasing corrections</span>
                <p className="body">Time spent fixing the record instead of running the job.</p>
              </div>
            </div>
            <p className="cost-note center" data-reveal>
              Flostruction&apos;s answer is simple: <strong>evidence when you need it.</strong>{' '}
              Every hour verified at the source, sealed, and ready to stand on its own.
            </p>
          </div>
        </section>

        {/* How it works (§4.3) — plain three steps */}
        <section className="section section--surface" id="how">
          <div className="wrap">
            <div className="section-head center" data-reveal>
              <div className="eyebrow" style={{ marginBottom: 16 }}>
                How it works
              </div>
              <h2 className="h2">Three steps. No paper, no chasing.</h2>
            </div>
            <div className="steps" data-reveal-group>
              <div className="step-line" aria-hidden="true" />
              <div className="step">
                <div className="step-num">1</div>
                <h3 className="h3">Worker clocks in</h3>
                <p className="body">
                  GPS, timestamp, and site captured the moment the shift starts. No paper, no
                  WhatsApp.
                </p>
              </div>
              <div className="step">
                <div className="step-num">2</div>
                <h3 className="h3">Supervisor approves by SMS</h3>
                <p className="body">
                  One reply approves the whole crew. No new app to roll out across every site.
                </p>
              </div>
              <div className="step">
                <div className="step-num">3</div>
                <h3 className="h3">Payroll gets verified hours</h3>
                <p className="body">
                  Verified hours export clean, ready for your payroll provider. Every hour accounted
                  for.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* See it in action — the device-mockup spine (synthetic data) */}
        <MarketingScreenshots />

        {/* Why labour-hire companies choose Flostruction (§4.4) — buyer value */}
        <section className="section section--paper" id="labour-hire">
          <div className="wrap">
            <div className="section-head center" data-reveal>
              <div className="eyebrow" style={{ marginBottom: 16 }}>
                For labour hire
              </div>
              <h2 className="h2">Why labour-hire companies choose Flostruction</h2>
              <p className="lead center" style={{ marginTop: 16 }}>
                Built for the operator who carries the dispute, the invoice, and the client
                relationship.
              </p>
            </div>
            <div className="value-grid" data-reveal-group>
              <div className="value-card">
                <h3 className="h3">Fewer client timesheet disputes</h3>
                <p className="body">
                  One verified record of every shift means fewer arguments over invoices, and a
                  faster answer when a question comes up.
                </p>
              </div>
              <div className="value-card">
                <h3 className="h3">No more paper approvals</h3>
                <p className="body">
                  Supervisors approve by SMS. Nothing new to install or train across every site and
                  crew.
                </p>
              </div>
              <div className="value-card">
                <h3 className="h3">A permanent record per placement</h3>
                <p className="body">
                  Every shift sealed and exportable, ready for the conversations that decide whether
                  a placement was worth it.
                </p>
              </div>
              <div className="value-card">
                <h3 className="h3">Stronger evidence for Fair Work and audits</h3>
                <p className="body">
                  When records are questioned, you have a tamper-evident answer, not a
                  reconstruction from memory.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* The standard — WLES, translated (§4.5). Home of the seal demo. */}
        <section className="section section--ink" id="standard">
          <div className="wrap">
            <div className="standard-grid">
              <div className="standard-copy" data-reveal>
                <div className="eyebrow" style={{ marginBottom: 16 }}>
                  The standard
                </div>
                <h2 className="h2">Records that can&apos;t be edited or deleted</h2>
                <p className="lead" style={{ marginTop: 16 }}>
                  Every shift is sealed into the Workforce Ledger Evidentiary Standard (WLES) —
                  permanent proof of every hour, tamper-evident by design.
                </p>
                <div className="standard-points">
                  <div className="standard-point">
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M5 12l5 5 9-11"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Sealed the moment a shift is approved.
                  </div>
                  <div className="standard-point">
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M5 12l5 5 9-11"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Permanent — records can&apos;t be quietly edited or deleted.
                  </div>
                  <div className="standard-point">
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M5 12l5 5 9-11"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Tamper-evident — any change to a sealed record is detectable.
                  </div>
                  <div className="standard-point">
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M5 12l5 5 9-11"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Exportable — verified hours, ready for payroll.
                  </div>
                </div>
                <div className="hero-ctas" style={{ marginTop: 28 }}>
                  <a className="btn btn-ghost-dark" href="/wles">
                    Read the WLES standard
                  </a>
                </div>
              </div>
              <div className="standard-demo" data-reveal>
                <SealPlayer />
                <p className="standard-caption">
                  Watch a shift become a permanent record. Shown with synthetic data — names, sites,
                  and hashes are illustrative.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Personas (§4.7) — guided arc, each with a real CTA */}
        <section className="section section--surface" id="personas">
          <div className="wrap">
            <div className="section-head center" data-reveal>
              <div className="eyebrow" style={{ marginBottom: 16 }}>
                Who it&apos;s for
              </div>
              <h2 className="h2">Everyone on the job, on the same record</h2>
            </div>

            <div className="persona" data-reveal>
              <div
                className="persona-photo"
                style={{ backgroundImage: `url('${img(PHOTOS.worker)}')` }}
                role="img"
                aria-label="Construction worker on site"
              />
              <div>
                <div className="eyebrow persona-label">The worker</div>
                <h3 className="h3">You were on site at 6am. The timesheet says 7.</h3>
                <p className="body">
                  Clock on from the site. Your hours are captured and confirmed the moment your
                  shift ends — proof you did the work, without chasing anyone.
                </p>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => scrollTo('see-it-in-action')}
                >
                  See the worker app
                </button>
              </div>
            </div>

            <div className="persona rev" data-reveal>
              <div
                className="persona-photo"
                style={{ backgroundImage: `url('${img(PHOTOS.manager)}')` }}
                role="img"
                aria-label="Site manager reviewing plans"
              />
              <div>
                <div className="eyebrow persona-label">The site manager</div>
                <h3 className="h3">
                  You didn&apos;t get into construction to reconcile spreadsheets.
                </h3>
                <p className="body">
                  Approve a whole crew&apos;s timesheets from one SMS. No new app, no chasing, no
                  late-night cross-checking against an invoice with different numbers.
                </p>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => scrollTo('see-it-in-action')}
                >
                  See SMS approval
                </button>
              </div>
            </div>

            <div className="persona" data-reveal>
              <div
                className="persona-photo"
                style={{ backgroundImage: `url('${img(PHOTOS.hire)}')` }}
                role="img"
                aria-label="Building exterior"
              />
              <div>
                <div className="eyebrow persona-label">The labour hire company</div>
                <h3 className="h3">The invoice was right. Now prove it.</h3>
                <p className="body">
                  Every placement backed by sealed, exportable records — so a dispute is settled by
                  evidence, not by who negotiates hardest.
                </p>
                <button type="button" className="btn btn-signal" onClick={openModal}>
                  Book a demo
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Trust / credibility (§4.6) — honest only; metrics stay empty until real */}
        <section className="section section--paper" id="trust">
          <div className="wrap">
            {SOCIAL_PROOF.length > 0 && (
              <div className="metrics-row" data-reveal-group>
                {SOCIAL_PROOF.map((m) => (
                  <div className="metric" key={m.label}>
                    <div className="m-val">{m.value}</div>
                    <div className="m-label">{m.label}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="section-head center" data-reveal>
              <div className="eyebrow" style={{ marginBottom: 16 }}>
                Why trust it
              </div>
              <h2 className="h2">Credibility you can check</h2>
            </div>
            <div className="trust-grid" data-reveal-group>
              <div className="trust-card">
                <h3 className="h3">Built on a published standard</h3>
                <p>
                  Records are written to the Workforce Ledger Evidentiary Standard (WLES v1.0). The
                  specification is public; independent peer review is in progress.
                </p>
              </div>
              <div className="trust-card">
                <h3 className="h3">Founder-built for the floor</h3>
                <p>
                  Created by a team with Australian legal training and time on construction sites —
                  built for the people who carry the dispute.
                </p>
              </div>
              <div className="trust-card">
                <h3 className="h3">Ready for Payday Super</h3>
                <p>Verified hour records your payroll provider can rely on ahead of 1 July 2026.</p>
              </div>
              <div className="trust-card">
                <h3 className="h3">Private beta</h3>
                <p>Flostruction is in private beta. Request access to run it on your sites.</p>
                <button type="button" className="btn btn-ghost tc-cta" onClick={openModal}>
                  Request access
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Payday Super (§4.8) — regulatory anchor, readiness framing. Verbatim. */}
        <section className="section section--ink" id="payday">
          <div className="wrap">
            <div className="payday-card">
              <div className="eyebrow" style={{ marginBottom: 16 }}>
                Regulatory change
              </div>
              <h2 className="h2">
                Payday Super starts <span className="pd-date">1 July 2026.</span>
              </h2>
              <p className="lead pd-body" style={{ marginTop: 18 }}>
                The Treasury Laws Amendment (Payday Superannuation) Act 2025 has passed. Your super
                obligations are calculated from your payroll records.
              </p>
              <p className="lead pd-body">
                Flostruction gives you verified, tamper-proof hour records your payroll provider can
                rely on.
              </p>
              <p className="lead pd-body" style={{ fontWeight: 600 }}>
                Every hour. Every shift. Permanently recorded.
              </p>
              <p className="pd-fine">
                Speak to your payroll provider or accountant about your super payment obligations.
              </p>
              <button type="button" className="btn btn-signal" onClick={openModal}>
                Talk to us about verified hours
              </button>
            </div>
          </div>
        </section>

        {/* Final CTA (§4.9) */}
        <section className="section section--ink center" id="cta">
          <div className="wrap" data-reveal>
            <div className="eyebrow" style={{ marginBottom: 16 }}>
              Get started
            </div>
            <h2 className="h2">Verified hours you can stand behind</h2>
            <p className="lead center" style={{ marginTop: 16 }}>
              Flostruction is a time verification platform for the workers, site managers, and
              labour hire companies who need hours they can trust.
            </p>
            <div className="final-ctas">
              <button type="button" className="btn btn-signal" onClick={openModal}>
                Book a demo
              </button>
              <a className="btn btn-ghost-dark" href="/get-started">
                Get Flostruction
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer — entity / compliance line verbatim */}
      <footer className="lp-footer">
        <div>
          <div className="f-logo">Flostruction</div>
          <div className="f-sub">Verified hours, every shift.</div>
          <div className="f-fine">
            {FOOTER_WLES_LINE}
            <br />
            {FOOTER_ENTITY}
          </div>
        </div>
        <div className="f-links">
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms of Service</a>
        </div>
      </footer>

      {/* Contact / demo dialog */}
      <div
        className={`modal-overlay${modalOpen ? ' open' : ''}`}
        inert={!modalOpen}
        onClick={(e) => {
          if (e.target === e.currentTarget) setModalOpen(false);
        }}
      >
        <div
          className="modal-box"
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="contact-modal-title"
        >
          <div className="modal-header">
            <h2 id="contact-modal-title">Book a demo</h2>
            <button className="modal-close" onClick={() => setModalOpen(false)} aria-label="Close">
              ×
            </button>
          </div>
          <div className="modal-body">
            {!submitted ? (
              <>
                <p className="modal-intro">
                  Tell us a bit about your operation and we&apos;ll come back to you within one
                  business day.
                </p>
                {submitError && (
                  <div className="modal-error">
                    Something went wrong. Please try again or email us directly at
                    hello@flosmosis.com
                  </div>
                )}
                <form onSubmit={handleSubmit}>
                  <div className="form-row">
                    <label>
                      Name <span>*</span>
                    </label>
                    <input
                      required
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Your name"
                    />
                  </div>
                  <div className="form-row">
                    <label>
                      Company <span>*</span>
                    </label>
                    <input
                      required
                      value={form.company}
                      onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                      placeholder="Company name"
                    />
                  </div>
                  <div className="form-row">
                    <label>
                      Your Role <span>*</span>
                    </label>
                    <select
                      required
                      value={form.role}
                      onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                    >
                      <option value="">Select your role</option>
                      <option value="Site Manager">Site Manager</option>
                      <option value="Labour Hire Company">Labour Hire Company</option>
                      <option value="Payroll / Finance">Payroll / Finance</option>
                      <option value="Project Manager">Project Manager</option>
                      <option value="Business Owner">Business Owner</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <label>
                      Email <span>*</span>
                    </label>
                    <input
                      required
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="your@email.com"
                    />
                  </div>
                  <div className="form-row">
                    <label>Phone</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="+61 4XX XXX XXX"
                    />
                  </div>
                  <div className="form-row">
                    <label>How many workers on site?</label>
                    <select
                      value={form.workers}
                      onChange={(e) => setForm((f) => ({ ...f, workers: e.target.value }))}
                    >
                      <option value="">Select…</option>
                      <option value="1-15">1–15</option>
                      <option value="16-30">16–30</option>
                      <option value="31-60">31–60</option>
                      <option value="60+">60+</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <label>Anything else we should know? (optional)</label>
                    <textarea
                      value={form.message}
                      onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                      placeholder="Tell us about your current time tracking challenges…"
                    />
                  </div>
                  <button type="submit" className="form-submit" disabled={submitting}>
                    {submitting ? 'Sending…' : 'Send →'}
                  </button>
                  <p className="form-fine">
                    No spam. No sales scripts. Just a straight conversation about whether
                    Flostruction is right for you.
                  </p>
                </form>
              </>
            ) : (
              <div className="success">
                <h3>You&apos;re on the list.</h3>
                <p>
                  We&apos;ll be in touch within one business day.
                  <br />
                  In the meantime, if you need to reach us directly:{' '}
                  <a href="mailto:hello@flosmosis.com">hello@flosmosis.com</a>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
