'use client';

import { useState, useEffect } from 'react';

// Flostruction Landing Page — verified-hours-at-source posture (Day 7 2026-04-24).
// Full-screen background-image sections, Barlow Condensed typography.
// Form submits to POST /api/contact (Day 3 P2.1 — Formspree removed).
// Posture rule applied: describe only what FLOSTRUCTION IS; no negative
// disclaimers, no regulatory framing, no forbidden words.
// See Desktop/landing-page-rebuild-2026-04-23.md for hero-variant pick sheet.

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

// Day 3 P2.3 — Unsplash removed. Self-hosted placeholders live in
// /public/placeholders/. Swap paths to /images/batch-11/<slot>.jpg once
// approved Batch-11 imagery lands.
const PHOTOS = {
  hero:    '/placeholders/hero.svg',    // hero — replace with Batch-11 hero image
  worker:  '/placeholders/worker.svg',  // worker — replace with Batch-11 worker photography
  manager: '/placeholders/manager.svg', // manager — replace with Batch-11 site-manager photography
  hire:    '/placeholders/hire.svg',    // hire — replace with Batch-11 labour-hire / city photography
};

const img = (path: string) => path;

export default function LandingPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setModalOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = modalOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [modalOpen]);

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

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
    <>
      <style>{`
        /* Day 3 P2.2 — Google Fonts import removed. Barlow + Barlow Condensed
           are loaded via next/font/google in src/app/layout.tsx, self-hosted
           at runtime via --font-barlow / --font-barlow-condensed CSS vars. */

        :root {
          --ink:    #0e0c09;
          --amber:  #c8530a;
          --cream:  #f5f0e8;
          --grain:  #f0ede6;
          --light:  #faf7f2;
          --muted:  #7a6f60;
          --border: rgba(26,20,16,0.12);
        }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; background: var(--ink); }
        body {
          font-family: var(--font-barlow), 'Barlow', -apple-system, BlinkMacSystemFont, sans-serif;
          color: var(--ink);
          background: var(--ink);
          overflow-x: hidden;
        }

        /* ── ANNOUNCEMENT BAR ── */
        .ann-bar {
          background: var(--amber);
          color: #fff;
          text-align: center;
          padding: 10px 24px;
          font-size: 0.82rem;
          font-weight: 500;
          letter-spacing: 0.02em;
          position: relative;
          z-index: 100;
        }
        .ann-bar a { color: #fff; font-weight: 700; margin-left: 6px; text-decoration: none; }
        .ann-bar a:hover { text-decoration: underline; }

        /* ── NAV ── */
        #main-nav {
          position: sticky;
          top: 0;
          z-index: 90;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 48px;
          height: 68px;
          background: var(--ink);
          border-bottom: 1px solid transparent;
          transition: border-color 0.3s, background 0.3s;
        }
        #main-nav.scrolled {
          background: rgba(14,12,9,0.96);
          border-bottom-color: rgba(255,255,255,0.08);
          backdrop-filter: blur(8px);
        }
        .nav-brand { cursor: pointer; }
        .nav-brand .logo {
          font-family: var(--font-barlow-condensed), 'Barlow Condensed', sans-serif;
          font-size: 1.35rem;
          font-weight: 800;
          letter-spacing: 0.12em;
          color: #fff;
          text-transform: uppercase;
          line-height: 1;
        }
        .nav-brand .logo-sub {
          font-family: var(--font-barlow), 'Barlow', sans-serif;
          font-size: 0.62rem;
          font-weight: 400;
          letter-spacing: 0.18em;
          color: rgba(255,255,255,0.4);
          text-transform: uppercase;
          margin-top: 2px;
        }
        .nav-links { display: flex; align-items: center; gap: 32px; }
        .nav-links a {
          color: rgba(255,255,255,0.65);
          text-decoration: none;
          font-size: 0.88rem;
          font-weight: 500;
          letter-spacing: 0.04em;
          transition: color 0.2s;
        }
        .nav-links a:hover { color: #fff; }
        .btn-nav {
          background: var(--amber);
          color: #fff;
          border: none;
          padding: 10px 24px;
          font-family: var(--font-barlow-condensed), 'Barlow Condensed', sans-serif;
          font-size: 0.9rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          transition: opacity 0.2s;
          min-height: 40px;
        }
        .btn-nav:hover { opacity: 0.85; }

        /* ── HERO — full-screen background image (original design) ── */
        #hero {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          position: relative;
          overflow: hidden;
          background:
            linear-gradient(100deg, rgba(10,10,9,0.88) 0%, rgba(10,10,9,0.65) 45%, rgba(10,10,9,0.25) 100%),
            url('${img(PHOTOS.hero)}') center/cover no-repeat;
        }
        #hero .section-inner {
          max-width: 1020px;
          padding: 60px 52px 0;
        }
        .hero-eyebrow {
          font-family: var(--font-barlow), 'Barlow', sans-serif;
          font-size: 0.72rem;
          font-weight: 500;
          letter-spacing: 0.22em;
          color: rgba(255,255,255,0.45);
          text-transform: uppercase;
          margin-bottom: 24px;
        }
        .hero-headline {
          font-family: var(--font-barlow-condensed), 'Barlow Condensed', sans-serif;
          display: flex;
          flex-direction: column;
          margin-bottom: 36px;
          line-height: 1;
        }
        .line-light {
          font-size: clamp(1.8rem, 3.2vw, 3.5rem);
          font-weight: 500;
          color: rgba(255,255,255,0.45);
          text-transform: uppercase;
          letter-spacing: 0.01em;
        }
        .line-heavy {
          font-size: clamp(2.6rem, 5.2vw, 6rem);
          font-weight: 800;
          color: #fff;
          text-transform: uppercase;
          letter-spacing: -0.01em;
          line-height: 0.9;
          margin-top: -2px;
        }
        .line-accent {
          font-size: clamp(2.2rem, 4.8vw, 5.5rem);
          font-weight: 800;
          color: var(--amber);
          text-transform: uppercase;
          letter-spacing: -0.01em;
          line-height: 0.92;
          margin-top: -2px;
        }
        .hero-rule {
          width: 48px;
          height: 3px;
          background: var(--amber);
          margin-bottom: 20px;
        }
        .hero-sub {
          font-size: 1rem;
          line-height: 1.75;
          color: rgba(255,255,255,0.6);
          max-width: 520px;
          margin-bottom: 40px;
        }
        .hero-sub strong { color: rgba(255,255,255,0.9); font-weight: 600; }
        .hero-ctas { display: flex; gap: 16px; flex-wrap: wrap; }
        .btn-primary {
          background: var(--amber);
          color: #fff;
          border: none;
          padding: 15px 36px;
          font-family: var(--font-barlow-condensed), 'Barlow Condensed', sans-serif;
          font-size: 0.95rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          transition: opacity 0.2s;
          min-height: 50px;
        }
        .btn-primary:hover { opacity: 0.85; }
        .btn-secondary {
          background: transparent;
          color: rgba(255,255,255,0.7);
          border: 1.5px solid rgba(255,255,255,0.22);
          padding: 15px 36px;
          font-family: var(--font-barlow-condensed), 'Barlow Condensed', sans-serif;
          font-size: 0.95rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s;
          min-height: 50px;
        }
        .btn-secondary:hover { border-color: rgba(255,255,255,0.55); color: #fff; }
        .scroll-label {
          position: absolute;
          bottom: 44px;
          left: 52px;
          font-family: var(--font-barlow-condensed), 'Barlow Condensed', sans-serif;
          font-size: 0.72rem;
          letter-spacing: 0.2em;
          color: rgba(240,237,231,0.3);
          text-transform: uppercase;
          z-index: 2;
        }

        /* ── PROGRESS DOTS ── */
        .progress-dots {
          position: fixed;
          right: 24px;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          flex-direction: column;
          gap: 10px;
          z-index: 80;
        }
        .progress-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: rgba(255,255,255,0.2);
          border: none;
          cursor: pointer;
          transition: all 0.3s;
        }
        .progress-dot.active { background: var(--amber); transform: scale(1.4); }

        /* ── PROBLEM SECTIONS — full-screen background images ── */
        .problem-section {
          position: relative;
          height: 100vh;
          min-height: 640px;
          display: flex;
          align-items: flex-end;
          overflow: hidden;
          background-size: cover;
          background-position: center;
        }
        #worker  { background-image: url('${img(PHOTOS.worker)}');  }
        #manager { background-image: url('${img(PHOTOS.manager)}'); }
        #hire    { background-image: url('${img(PHOTOS.hire)}');    }

        .problem-section::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(
            160deg,
            rgba(14,12,9,0.25) 0%,
            rgba(14,12,9,0.88) 65%,
            rgba(14,12,9,0.97) 100%
          );
          z-index: 1;
        }
        .problem-section .section-inner {
          position: relative;
          z-index: 3;
          padding: 0 80px 80px;
          max-width: 820px;
          width: 100%;
        }
        .bg-number {
          position: absolute;
          right: -0.04em;
          bottom: -0.15em;
          font-family: var(--font-barlow-condensed), 'Barlow Condensed', sans-serif;
          font-size: 38vw;
          font-weight: 900;
          color: rgba(255,255,255,0.04);
          line-height: 1;
          z-index: 2;
          pointer-events: none;
          user-select: none;
          letter-spacing: -0.05em;
        }
        .label {
          font-family: var(--font-barlow), 'Barlow', sans-serif;
          font-size: 0.7rem;
          font-weight: 500;
          letter-spacing: 0.22em;
          color: var(--amber);
          text-transform: uppercase;
          margin-bottom: 16px;
        }
        .problem-headline {
          font-family: var(--font-barlow-condensed), 'Barlow Condensed', sans-serif;
          display: flex;
          flex-direction: column;
          margin-bottom: 24px;
          line-height: 1;
        }
        .problem-headline .sub {
          font-size: clamp(1.3rem, 2.4vw, 2.8rem);
          font-weight: 600;
          color: rgba(255,255,255,0.55);
          text-transform: uppercase;
          letter-spacing: 0.01em;
        }
        .problem-headline .punch {
          font-size: clamp(2.2rem, 5vw, 6rem);
          font-weight: 800;
          color: #fff;
          text-transform: uppercase;
          letter-spacing: -0.01em;
          line-height: 0.9;
          margin-top: -2px;
        }
        .problem-body {
          font-size: 0.95rem;
          line-height: 1.8;
          color: rgba(255,255,255,0.55);
          max-width: 560px;
        }

        /* ── PIVOT ── */
        #pivot {
          background: var(--ink);
          padding: 120px 80px;
          text-align: center;
        }
        .pivot-rule {
          width: 48px;
          height: 2px;
          background: var(--amber);
          margin: 0 auto 40px;
        }
        .pivot-headline {
          font-family: var(--font-barlow-condensed), 'Barlow Condensed', sans-serif;
          font-size: clamp(2.4rem, 5vw, 5.5rem);
          font-weight: 800;
          line-height: 1.05;
          color: #fff;
          text-transform: uppercase;
          letter-spacing: -0.01em;
          margin-bottom: 32px;
        }
        .pivot-headline em { color: var(--amber); font-style: normal; }
        .pivot-body {
          font-size: 1rem;
          line-height: 1.85;
          color: rgba(255,255,255,0.55);
          max-width: 560px;
          margin: 0 auto;
        }

        /* ── SOLUTION ── */
        #solution { background: var(--light); padding: 120px 80px; }
        .solution-header { text-align: center; margin-bottom: 80px; }
        .solution-tag {
          font-family: var(--font-barlow), 'Barlow', sans-serif;
          font-size: 0.7rem;
          font-weight: 500;
          letter-spacing: 0.22em;
          color: var(--amber);
          text-transform: uppercase;
          margin-bottom: 20px;
        }
        .solution-headline {
          font-family: var(--font-barlow-condensed), 'Barlow Condensed', sans-serif;
          font-size: clamp(2.4rem, 5vw, 5.5rem);
          font-weight: 800;
          line-height: 1.0;
          color: var(--ink);
          text-transform: uppercase;
          letter-spacing: -0.01em;
          margin-bottom: 20px;
        }
        .solution-headline span { color: var(--amber); }
        .solution-tagline {
          font-size: 1rem;
          line-height: 1.75;
          color: var(--muted);
          max-width: 480px;
          margin: 0 auto;
        }
        .solution-tagline strong { color: var(--ink); }
        .solution-cards {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 32px;
          max-width: 1100px;
          margin: 0 auto;
        }
        .solution-card {
          background: #fff;
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 40px 32px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.04);
        }
        .card-num {
          font-family: var(--font-barlow), 'Barlow', sans-serif;
          font-size: 0.68rem;
          font-weight: 600;
          letter-spacing: 0.18em;
          color: var(--amber);
          text-transform: uppercase;
          margin-bottom: 16px;
        }
        .card-headline {
          font-family: var(--font-barlow-condensed), 'Barlow Condensed', sans-serif;
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--ink);
          margin-bottom: 14px;
          line-height: 1.15;
        }
        .card-body {
          font-size: 0.93rem;
          line-height: 1.8;
          color: var(--muted);
        }

        /* ── CTA ── */
        #cta {
          background: var(--ink);
          padding: 120px 80px;
          text-align: center;
        }
        .cta-headline {
          font-family: var(--font-barlow-condensed), 'Barlow Condensed', sans-serif;
          font-size: clamp(2.8rem, 6vw, 7rem);
          font-weight: 800;
          line-height: 1.0;
          color: #fff;
          text-transform: uppercase;
          letter-spacing: -0.01em;
          margin-bottom: 24px;
        }
        .cta-headline span { color: var(--amber); }
        .cta-body {
          font-size: 1rem;
          line-height: 1.8;
          color: rgba(255,255,255,0.55);
          max-width: 520px;
          margin: 0 auto 48px;
        }

        /* ── FOOTER ── */
        footer {
          background: var(--ink);
          border-top: 1px solid rgba(255,255,255,0.07);
          padding: 40px 80px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .footer-brand .footer-logo {
          font-family: var(--font-barlow-condensed), 'Barlow Condensed', sans-serif;
          font-size: 1.1rem;
          font-weight: 800;
          letter-spacing: 0.12em;
          color: #fff;
          text-transform: uppercase;
        }
        .footer-brand .footer-sub {
          font-size: 0.75rem;
          color: rgba(255,255,255,0.35);
          margin-top: 3px;
          letter-spacing: 0.04em;
        }
        .footer-links { display: flex; gap: 24px; }
        .footer-links button {
          background: none;
          border: none;
          color: rgba(255,255,255,0.4);
          font-size: 0.82rem;
          cursor: pointer;
          transition: color 0.2s;
          padding: 0;
          min-height: auto;
        }
        .footer-links button:hover { color: rgba(255,255,255,0.75); }

        /* ── MODAL ── */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.7);
          z-index: 200;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.25s;
          backdrop-filter: blur(4px);
        }
        .modal-overlay.open { opacity: 1; pointer-events: all; }
        .modal-box {
          background: #fff;
          border-radius: 10px;
          max-width: 600px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          position: relative;
        }
        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 28px 32px 20px;
          border-bottom: 1px solid #eee;
        }
        .modal-header h2 {
          font-family: var(--font-barlow-condensed), 'Barlow Condensed', sans-serif;
          font-size: 1.4rem;
          font-weight: 700;
          color: var(--ink);
          letter-spacing: 0.02em;
        }
        .modal-close {
          background: none;
          border: none;
          cursor: pointer;
          color: #999;
          font-size: 1.5rem;
          line-height: 1;
          min-height: auto;
          padding: 4px 8px;
          transition: color 0.2s;
        }
        .modal-close:hover { color: var(--ink); }
        .modal-body { padding: 28px 32px 36px; }
        .modal-intro { font-size: 0.9rem; color: #666; line-height: 1.65; margin-bottom: 24px; }
        .modal-error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 6px;
          padding: 12px 16px;
          color: #b91c1c;
          font-size: 0.875rem;
          margin-bottom: 20px;
          display: none;
        }
        .modal-error.visible { display: block; }
        .form-row { margin-bottom: 20px; }
        .form-row label {
          display: block;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 6px;
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }
        .form-row label span { color: var(--amber); }
        .form-row input,
        .form-row select,
        .form-row textarea {
          width: 100%;
          border: 1.5px solid #e5e7eb;
          border-radius: 5px;
          padding: 11px 14px;
          font-size: 0.95rem;
          font-family: var(--font-barlow), 'Barlow', sans-serif;
          color: var(--ink);
          background: #fff;
          outline: none;
          transition: border-color 0.2s;
          min-height: 44px;
        }
        .form-row input:focus,
        .form-row select:focus,
        .form-row textarea:focus { border-color: var(--amber); }
        .form-row textarea { min-height: 90px; resize: vertical; line-height: 1.6; }
        .form-submit-btn {
          width: 100%;
          background: var(--amber);
          color: #fff;
          border: none;
          padding: 16px;
          border-radius: 5px;
          font-family: var(--font-barlow-condensed), 'Barlow Condensed', sans-serif;
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          transition: opacity 0.2s;
          min-height: 52px;
          margin-top: 8px;
        }
        .form-submit-btn:hover:not(:disabled) { opacity: 0.87; }
        .form-submit-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .form-fine {
          font-size: 0.78rem;
          color: #999;
          text-align: center;
          margin-top: 12px;
          line-height: 1.5;
        }
        .success-msg { text-align: center; padding: 24px 0; }
        .success-tick { font-size: 2.5rem; margin-bottom: 12px; }
        .success-msg h3 {
          font-family: var(--font-barlow-condensed), 'Barlow Condensed', sans-serif;
          font-size: 1.4rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: var(--ink);
          margin-bottom: 10px;
          text-transform: uppercase;
        }
        .success-msg p { font-size: 0.9rem; color: var(--muted); line-height: 1.6; }
        .success-msg a { color: var(--amber); }

        /* ── RESPONSIVE ── */
        @media (max-width: 900px) {
          #hero .section-inner,
          .problem-section .section-inner { padding: 0 32px 64px; }
          #solution, #pivot, #cta { padding: 80px 32px; }
          .solution-cards { grid-template-columns: 1fr; }
          footer { flex-direction: column; gap: 24px; text-align: center; padding: 40px 32px; }
          #main-nav { padding: 0 20px; }
          .scroll-label { left: 32px; }
          .progress-dots { display: none; }
          .bg-number { font-size: 55vw; }
        }
      `}</style>

      {/* Positive-only top strip — describes what FLOSTRUCTION IS. No
          forbidden words, no negative disclaimers, no regulatory framing. */}
      <div className="ann-bar">
        <span style={{ fontWeight: 700 }}>A records system for construction labour hire.</span>
        {' '}Workers confirm on-site. Supervisors confirm by SMS.
      </div>

      {/* Nav */}
      <nav id="main-nav" className={navScrolled ? 'scrolled' : ''}>
        <div className="nav-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <div className="logo">Flostruction</div>
          <div className="logo-sub">Time Verification</div>
        </div>
        <div className="nav-links">
          <a href="#solution" onClick={(e) => { e.preventDefault(); scrollTo('solution'); }}>Product</a>
          <a href="#" onClick={(e) => { e.preventDefault(); setModalOpen(true); }}>Contact</a>
          <button className="btn-nav" onClick={() => setModalOpen(true)}>Request Demo</button>
        </div>
      </nav>

      {/* Hero — full-screen background image, original design */}
      <section id="hero">
        <div className="section-inner">
          <div className="hero-eyebrow">Time Verification for Construction</div>
          <h1 className="hero-headline">
            <span className="line-light">Every hour</span>
            <span className="line-heavy">verified.</span>
            <span className="line-accent">Every record<br />permanent.</span>
          </h1>
          <div className="hero-rule" />
          <p className="hero-sub">
            <strong>Workers confirm on-site.</strong> Supervisors confirm by SMS.
            You get a record that holds up.
          </p>
          <div className="hero-ctas">
            <button className="btn-primary" onClick={() => setModalOpen(true)}>Request Demo</button>
            <button className="btn-secondary" onClick={() => scrollTo('worker')}>See the problem</button>
          </div>
        </div>
        <div className="scroll-label">Scroll</div>
      </section>

      {/* Progress dots */}
      <div className="progress-dots">
        {['hero','worker','manager','hire','pivot','solution'].map((id) => (
          <button key={id} className="progress-dot" onClick={() => scrollTo(id)} aria-label={`Go to ${id}`} />
        ))}
      </div>

      {/* 01 The Worker */}
      <section id="worker" className="problem-section" data-section="1">
        <div className="bg-number">01</div>
        <div className="section-inner">
          <div className="label">The Worker</div>
          <h2 className="problem-headline">
            <span className="sub">You were on site at 6am.</span>
            <span className="punch">The timesheet<br />says 7.</span>
          </h2>
          <p className="problem-body">
            The difference is one hour. But chasing it means calling someone who isn&apos;t answering, texting a site manager who&apos;s already moved on to the next job, and waiting — for a correction that may or may not come. You did the work. Proving it shouldn&apos;t be this hard.
          </p>
        </div>
      </section>

      {/* 02 The Site Manager */}
      <section id="manager" className="problem-section" data-section="2">
        <div className="bg-number">02</div>
        <div className="section-inner">
          <div className="label">The Site Manager</div>
          <h2 className="problem-headline">
            <span className="sub">You didn&apos;t get into construction</span>
            <span className="punch">to reconcile<br />spreadsheets.</span>
          </h2>
          <p className="problem-body">
            But every week, there you are. Cross-checking rosters against paper timesheets against a labour hire invoice with entirely different numbers. One crew member left early. Another worked overtime nobody formally approved. The data exists somewhere — but pulling it together is yours to do. Manually. The error could be anywhere. And the deadline is tomorrow morning.
          </p>
        </div>
      </section>

      {/* 03 The Labour Hire Company */}
      <section id="hire" className="problem-section" data-section="3">
        <div className="bg-number">03</div>
        <div className="section-inner">
          <div className="label">The Labour Hire Company</div>
          <h2 className="problem-headline">
            <span className="sub">The invoice was right.</span>
            <span className="punch">Now prove it.</span>
          </h2>
          <p className="problem-body">
            The site manager disputes two days. Your consultant remembers three. The worker says it was the full week. Everyone has a version. None of them are written down in a way that holds up. So you negotiate — not because the claim is wrong, but because you can&apos;t prove it fast enough to protect the relationship. The margin on that placement was already thin. It just got thinner.
          </p>
        </div>
      </section>

      {/* Pivot */}
      <section id="pivot">
        <div className="pivot-rule" />
        <h2 className="pivot-headline">
          Timesheet errors aren&apos;t<br />a process problem.<br /><em>They&apos;re a verification problem.</em>
        </h2>
        <p className="pivot-body">
          The hours were worked. The attendance was real. But when data lives across paper timesheets, WhatsApp threads and site manager memory, it can&apos;t verify itself. The error isn&apos;t inevitable — it&apos;s structural. Verify the hours first, and the rest falls into place.
        </p>
      </section>

      {/* Solution */}
      <section id="solution">
        <div className="solution-header">
          <div className="solution-tag">The Solution</div>
          <h2 className="solution-headline">
            Flostruction verifies<br />hours at the<br /><span>point of work.</span>
          </h2>
          <p className="solution-tagline">
            <strong>Every hour counted.</strong> Every hour verified. Permanent records from day one.
          </p>
        </div>
        <div className="solution-cards">
          <div className="solution-card">
            <div className="card-num">01 Capture</div>
            <h3 className="card-headline">Workers clock on and off from the site. GPS, timestamps, and supervisor confirmation — captured once, locked forever.</h3>
            <p className="card-body">No paper. No WhatsApp. The verified record exists the moment the shift ends.</p>
          </div>
          <div className="solution-card">
            <div className="card-num">02 Verify</div>
            <h3 className="card-headline">Flostruction Intelligence checks every shift for anomalies. Flagged shifts get human review. Clean shifts flow through.</h3>
            <p className="card-body">Tamper-evident WLES hash chains mean verified data stays verified. No one can quietly change the numbers.</p>
          </div>
          <div className="solution-card">
            <div className="card-num">03 Export</div>
            <h3 className="card-headline">Verified hours export as permanent records. One click, one CSV, every hour accounted for.</h3>
            <p className="card-body">Flostruction is the source of truth for hours worked. What happens downstream is between you and your provider.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="cta">
        <div className="label" style={{ marginBottom: 20 }}>Get Started</div>
        <h2 className="cta-headline">
          The error<br /><span>stops here.</span>
        </h2>
        <p className="cta-body">
          Flostruction is built for construction — a time verification platform for the workers, site managers, and labour hire companies who need verified hours they can trust.
        </p>
        <button className="btn-primary" onClick={() => setModalOpen(true)}>Request a Demo</button>
        <p style={{
          color: '#F5F3EE',
          fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
          fontSize: 14,
          marginTop: 16,
          textAlign: 'center',
          opacity: 0.85,
        }}>
          Or call Lauren directly: 0413 573 579
        </p>
      </section>

      {/* Footer */}
      <footer>
        <div className="footer-brand">
          <div className="footer-logo">Flostruction</div>
          <div className="footer-sub">Time verification for Australian construction.</div>
          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)', marginTop: '8px', maxWidth: '480px', lineHeight: 1.6 }}>
            A records system for construction labour hire. Worker-confirmed on-site. Supervisor-verified by SMS. Permanent, timestamped, exportable.
            <br />© 2026 FLOSMOSIS PTY LTD. Flostruction is a product of FLOSMOSIS PTY LTD.
          </div>
        </div>
        <div className="footer-links">
          <a href="/privacy" style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontSize: '0.85rem' }}>Privacy Policy</a>
          <a href="/terms" style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontSize: '0.85rem' }}>Terms of Service</a>
        </div>
      </footer>

      {/* Demo Modal */}
      <div
        className={`modal-overlay${modalOpen ? ' open' : ''}`}
        onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}
      >
        <div className="modal-box">
          <div className="modal-header">
            <h2>Request a Demo</h2>
            <button className="modal-close" onClick={() => setModalOpen(false)} aria-label="Close">×</button>
          </div>
          <div className="modal-body">
            {!submitted ? (
              <>
                <p className="modal-intro">
                  Let&apos;s talk. Tell us a bit about your operation and we&apos;ll be in touch within one business day.
                </p>
                {submitError && (
                  <div className="modal-error visible">
                    Something went wrong. Please try again or email us directly at hello@flosmosis.com
                  </div>
                )}
                <form onSubmit={handleSubmit}>
                  <div className="form-row">
                    <label>Name <span>*</span></label>
                    <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Your name" />
                  </div>
                  <div className="form-row">
                    <label>Company <span>*</span></label>
                    <input required value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="Company name" />
                  </div>
                  <div className="form-row">
                    <label>Your Role <span>*</span></label>
                    <select required value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
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
                    <label>Email <span>*</span></label>
                    <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="your@email.com" />
                  </div>
                  <div className="form-row">
                    <label>Phone</label>
                    <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+61 4XX XXX XXX" />
                  </div>
                  <div className="form-row">
                    <label>How many workers on site?</label>
                    <select value={form.workers} onChange={e => setForm(f => ({ ...f, workers: e.target.value }))}>
                      <option value="">Select…</option>
                      <option value="1-15">1–15</option>
                      <option value="16-30">16–30</option>
                      <option value="31-60">31–60</option>
                      <option value="60+">60+</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <label>Anything else we should know? (optional)</label>
                    <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="Tell us about your current time tracking challenges…" />
                  </div>
                  <button type="submit" className="form-submit-btn" disabled={submitting}>
                    {submitting ? 'Sending…' : 'Request Demo →'}
                  </button>
                  <p className="form-fine">No spam. No sales scripts. Just a straight conversation about whether Flostruction is right for you.</p>
                </form>
              </>
            ) : (
              <div className="success-msg">
                <div className="success-tick">✓</div>
                <h3>You&apos;re on the list.</h3>
                <p>We&apos;ll be in touch within one business day.<br />In the meantime, if you need to reach us directly: <a href="mailto:hello@flosmosis.com">hello@flosmosis.com</a></p>
              </div>
            )}
          </div>
        </div>
      </div>

    </>
  );
}
