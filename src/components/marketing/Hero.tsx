// Hero — stage (poster + gated video), scrim, orchestrated GSAP entrance.
// One fixed statement (no carousel): clearest read for a first-time visitor.
// The worker video/poster behind it is unchanged — only the overlaid copy is
// pinned to a single headline + subhead. flostruction-v5.html lineage.
'use client';

import { useEffect, useRef, useState } from 'react';
import { preload } from 'react-dom';
import { useGSAP } from '@gsap/react';
import { gsap, MM } from '@/lib/motion/gsap-client';

interface HeroProps {
  onBookDemo: () => void;
}

export function Hero({ onBookDemo }: HeroProps) {
  // LCP discipline: the poster is the LCP candidate — preload at high
  // priority; the loop video stays poster-first / desktop-only.
  preload('/marketing/hero-poster.jpg', { as: 'image', fetchPriority: 'high' });
  const heroRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoOn, setVideoOn] = useState(false);

  /* ---------- hero background video — desktop only, poster-first
       (the footage Lauren + Joao like; left exactly as it was) ---------- */
  useEffect(() => {
    const v = videoRef.current;
    const hero = heroRef.current;
    if (!v || !hero) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wide = window.matchMedia('(min-width: 861px)').matches;
    if (reduced || !wide) return;
    const go = () => { v.play().then(() => setVideoOn(true)).catch(() => {}); };
    v.preload = 'auto';
    if (v.readyState >= 2) go();
    else v.addEventListener('canplay', go, { once: true });
    try { v.load(); } catch { /* noop */ }
    let io: IntersectionObserver | null = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(
        (es) => es.forEach((e) => { if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }),
        { threshold: 0.12 },
      );
      io.observe(hero);
    }
    return () => io?.disconnect();
  }, []);

  /* ---------- hero entrance: orchestrated timeline + stage settle +
       scroll parallax, MM-tiered (unchanged) ---------- */
  useGSAP(
    () => {
      const heroEl = heroRef.current;
      if (!heroEl) return;
      const mm = gsap.matchMedia();
      const entrance = () => {
        gsap.set('[data-h="h"] .ln>span', { yPercent: 110 });
        gsap.set('[data-h="eb"],[data-h="sub"],[data-h="cta"],[data-h="meta"]', { autoAlpha: 0, y: 24 });
        const tl = gsap.timeline({ defaults: { ease: 'expo.out' }, delay: 0.15 });
        tl.to('[data-h="eb"]', { autoAlpha: 1, y: 0, duration: 0.8 })
          .to('[data-h="h"] .ln>span', { yPercent: 0, duration: 1.1, stagger: 0.12 }, '-=.55')
          .to('[data-h="sub"]', { autoAlpha: 1, y: 0, duration: 0.9 }, '-=.7')
          .to('[data-h="cta"]', { autoAlpha: 1, y: 0, duration: 0.8 }, '-=.65')
          .to('[data-h="meta"]', { autoAlpha: 1, y: 0, duration: 0.8 }, '-=.65');
      };
      mm.add(MM.full, () => {
        entrance();
        gsap.fromTo('#stage', { scale: 1.045 }, { scale: 1, duration: 14, ease: 'power1.out' });
        gsap.to('#stage', {
          yPercent: 10, ease: 'none',
          scrollTrigger: { trigger: heroEl, start: 'top top', end: 'bottom top', scrub: true },
        });
      });
      mm.add(MM.mobile, () => { entrance(); });
    },
    { scope: heroRef },
  );

  return (
    <section className="hero" id="hero" ref={heroRef}>
      <div className="stage" id="stage">
        {/* poster always; video upgraded on >=861px (footage unchanged) */}
        <img className="vposter" alt="" src="/marketing/hero-poster.jpg" fetchPriority="high" />
        <video
          className={videoOn ? 'herovid on' : 'herovid'}
          ref={videoRef}
          muted
          loop
          playsInline
          preload="none"
        >
          <source src="/marketing/hero-loop.mp4" type="video/mp4" />
        </video>
      </div>
      <div className="scrim" />
      <div className="hero-inner">
        <div className="hero-c" id="heroC">
          <div className="copywrap">
            <div className="copy on">
              <span className="eyebrow" data-h="eb">Time verification for construction &amp; labour hire</span>
              <h1 data-h="h">
                <span className="ln"><span>Hours verified </span></span>
                <span className="ln"><span>on site, sealed </span></span>
                <span className="ln"><span className="o">before payroll.</span></span>
              </h1>
              <p className="sub" data-h="sub">
                Workers clock on at the job. Supervisors approve by SMS. Every shift is locked into a
                tamper-proof record your payroll can trust — and nobody can argue with.
              </p>
            </div>
          </div>
          <div className="cta" data-h="cta">
            <button className="btn btn-solid" type="button" onClick={onBookDemo}>Book a demo</button>
            <a className="btn btn-ghost" href="#how">See how it works</a>
          </div>
          <div className="meta" data-h="meta">Now onboarding Australian construction &amp; labour hire</div>
        </div>
      </div>
    </section>
  );
}
