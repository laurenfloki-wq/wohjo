// FLOSTRUCTION marketing landing v5 — page assembly.
// Design source of truth: flostruction-v5.html (signed off as-is by
// Lauren and Joao, 2026-06-10). Section order, copy, and legal text
// are verbatim from the prototype; CTA wiring carries over the
// /api/contact lead path (Lauren, brief item (b)).
'use client';

import { useEffect, useState } from 'react';
import './marketing.css';
import { marketingFontClasses } from './fonts';
import { Hero } from './Hero';
import { Workflow } from './Workflow';
import { Logomark3D } from './Logomark3D';
import { Surfaces } from './Surfaces';
import { HashRibbon } from './HashRibbon';
import { ChainSection } from './ChainSection';
import { RevealSection } from './RevealSection';
import { ContactModal } from './ContactModal';
import { PaydaySection } from './PaydaySection';

export default function MarketingPage() {
  const [modalOpen, setModalOpen] = useState(false);

  // html{scroll-behavior:smooth} scoped to this route — applied on
  // mount, removed on unmount so other surfaces are untouched
  // (flostruction-v5.html:28).
  useEffect(() => {
    const prev = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'smooth';
    return () => {
      document.documentElement.style.scrollBehavior = prev;
    };
  }, []);

  return (
    <div className={`mkt ${marketingFontClasses}`}>
      <div className="notice">
        Payday Super starts 1 July 2026. Are your hour records verified and ready?{' '}
        <a href="#payday">Learn more</a>
      </div>

      <header className="mkt-header">
        <nav className="nav">
          <div className="brand">
            <Logomark3D />
            <div className="brandtxt">
              <span className="name">FLOSTRUCTION</span>
              <span className="vtag">Time Verification</span>
            </div>
          </div>
          <div className="links">
            <a href="#how">How it works</a>
            <a href="#chain">The standard</a>
            <a href="#action">For labour hire</a>
          </div>
          <div className="right">
            <button className="btn-link" type="button" onClick={() => setModalOpen(true)}>
              Talk to us
            </button>
            <button className="btn btn-solid" type="button" onClick={() => setModalOpen(true)}>
              Book a demo
            </button>
          </div>
        </nav>
      </header>

      <main id="main" tabIndex={-1}>
        <Hero onBookDemo={() => setModalOpen(true)} />

        <Workflow />

        <section className="band">
          <RevealSection className="problem wrap">
            <span className="eyebrow reveal d1">When hours aren&apos;t verified</span>
            <h2 className="reveal d2">
              A thumbs-up in a thread. A number nobody can stand behind.{' '}
              <span className="o">Everyone pays for it.</span>
            </h2>
            <p className="reveal d3">
              Paper timesheets, approvals that vanish into WhatsApp, disputes argued line by line
              every pay run. Flostruction&apos;s answer is simple: evidence when you need it.
            </p>
          </RevealSection>
        </section>

        <PaydaySection />

        <Surfaces />

        <HashRibbon />

        <ChainSection />

        <RevealSection as="section" className="closing">
          <div className="wrap">
            <h2 className="reveal d1">
              Every hour verified.
              <br />
              <span style={{ color: 'var(--gold)' }}>Every record permanent.</span>
            </h2>
            <p className="reveal d2">
              Records written to the Workforce Ledger Evidentiary Standard (WLES). Worker-confirmed
              on site, supervisor-verified by SMS, permanent and exportable.
            </p>
            <div className="cta reveal d3">
              <button className="btn btn-solid" type="button" onClick={() => setModalOpen(true)}>
                Book a demo
              </button>
              <a className="btn btn-ghost" href="/wles">
                Read the WLES standard
              </a>
            </div>
          </div>
        </RevealSection>
      </main>

      <footer className="mkt-footer">
        <div className="wrap">
          <div className="row">
            <span>
              © 2026 FLOSMOSIS PTY LTD (ACN 697 323 925) · Flostruction is a product of FLOSMOSIS
              PTY LTD · Built in Australia.
            </span>
            <span>
              <a href="/guides">Guides</a> · <a href="/privacy">Privacy Policy</a> ·{' '}
              <a href="/terms">Terms of Service</a>
            </span>
          </div>
        </div>
        <div className="disc">
          Flostruction is a workforce time verification platform. It does not calculate wages, award
          entitlements, tax, or superannuation. Demo records show synthetic data; names, sites, and
          hashes are illustrative.
        </div>
      </footer>

      <div className="grain" aria-hidden="true" />

      <ContactModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
