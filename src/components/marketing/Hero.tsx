// Hero — stage (poster + gated video), scrim, orchestrated GSAP
// entrance, copy carousel with dots/arrows/swipe/keyboard, stage
// scrub. flostruction-v5.html:432-476 (markup), 681-738 (behaviour).
'use client';

import { useEffect, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap, MM } from '@/lib/motion/gsap-client';

const SLIDE_COUNT = 4;
const ADVANCE_MS = 7500;

interface HeroProps {
  onBookDemo: () => void;
}

export function Hero({ onBookDemo }: HeroProps) {
  const heroRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [slide, setSlide] = useState(0);
  const [halted, setHalted] = useState(false);
  const [videoOn, setVideoOn] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const haltedRef = useRef(false);
  const rmRef = useRef(false);

  /* ---------- copy carousel — auto-advance, yields to the user
       (flostruction-v5.html:698-723) ---------- */
  const pause = () => { if (timerRef.current) clearTimeout(timerRef.current); };
  const tick = () => {
    pause();
    timerRef.current = setTimeout(() => {
      setSlide((i) => (i + 1) % SLIDE_COUNT);
      tick();
    }, ADVANCE_MS);
  };
  const play = () => { if (rmRef.current || haltedRef.current) return; tick(); };
  const halt = () => { haltedRef.current = true; pause(); setHalted(true); };
  const user = (n: number) => { halt(); setSlide(((n % SLIDE_COUNT) + SLIDE_COUNT) % SLIDE_COUNT); };
  /* relative moves use the functional form so handlers never read state
     during render (react-compiler rule) */
  const userStep = (d: number) => { halt(); setSlide((i) => (((i + d) % SLIDE_COUNT) + SLIDE_COUNT) % SLIDE_COUNT); };

  useEffect(() => {
    rmRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    play();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') userStep(1);
      else if (e.key === 'ArrowLeft') userStep(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => { pause(); document.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* swipe — pointerdown/up deltas over 55 px advance/retreat */
  const swipeX = useRef<number | null>(null);
  const onPointerDown = (e: React.PointerEvent) => { swipeX.current = e.clientX; };
  const onPointerUp = (e: React.PointerEvent) => {
    if (swipeX.current != null) {
      const dx = e.clientX - swipeX.current;
      if (Math.abs(dx) > 55) userStep(dx < 0 ? 1 : -1);
    }
    swipeX.current = null;
  };

  /* ---------- hero background video — desktop only, poster-first
       (flostruction-v5.html:725-738) ---------- */
  useEffect(() => {
    const v = videoRef.current;
    const hero = heroRef.current;
    if (!v || !hero) return;
    const wide = window.matchMedia('(min-width: 861px)').matches;
    if (rmRef.current || !wide) return;
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
       scroll parallax (flostruction-v5.html:681-696), MM-tiered ---------- */
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
        /* slow settle on the stage + scroll parallax */
        gsap.fromTo('#stage', { scale: 1.045 }, { scale: 1, duration: 14, ease: 'power1.out' });
        /* trigger must be the element, not a selector string: useGSAP
           scopes selector resolution to heroRef, and '#hero' IS the
           scope root, so the string form logs "Element not found" and
           falls back to the viewport (console-clean gate). */
        gsap.to('#stage', {
          yPercent: 10, ease: 'none',
          scrollTrigger: { trigger: heroEl, start: 'top top', end: 'bottom top', scrub: true },
        });
      });
      /* mobile tier: entrance only — no parallax scrub (engine policy) */
      mm.add(MM.mobile, () => { entrance(); });
    },
    { scope: heroRef },
  );

  const heroClass = halted ? 'hero paused' : 'hero';

  return (
    <section
      className={heroClass}
      id="hero"
      ref={heroRef}
      onPointerEnter={pause}
      onPointerLeave={() => { if (!haltedRef.current) play(); }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <div className="stage" id="stage">
        {/* plain img: full-bleed cover stage; exact prototype loading
            behaviour (poster always; video upgraded on >=861px) */}
        <img className="vposter" alt="" src="/marketing/hero-poster.jpg" />
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
            <div className={slide === 0 ? 'copy on' : 'copy'}>
              <span className="eyebrow" data-h="eb">Time verification for construction</span>
              <h1 data-h="h">
                <span className="ln"><span>Stop timesheet</span></span>
                <span className="ln"><span>disputes <span className="o">before</span></span></span>
                <span className="ln"><span className="o">they start.</span></span>
              </h1>
              <p className="sub" data-h="sub">Every hour verified at the point of work and sealed into a permanent, tamper-evident record.</p>
            </div>
            <div className={slide === 1 ? 'copy on' : 'copy'}>
              <span className="eyebrow">The problem</span>
              <h1>You were on site at 6. <span className="o">The sheet says 7.</span></h1>
              <p className="sub">Paper timesheets, approvals that vanish into WhatsApp, disputes argued line by line every pay run.</p>
            </div>
            <div className={slide === 2 ? 'copy on' : 'copy'}>
              <span className="eyebrow">How it works</span>
              <h1>Clock on. Approve by SMS. <span className="o">Done.</span></h1>
              <p className="sub">Hours captured the moment a shift starts, approved in seconds, exported clean to payroll.</p>
            </div>
            <div className={slide === 3 ? 'copy on' : 'copy'}>
              <span className="eyebrow">The standard</span>
              <h1>Records that <span className="o">can&apos;t be edited or deleted.</span></h1>
              <p className="sub">Every shift sealed into the Workforce Ledger Evidentiary Standard — permanent, tamper-evident by design.</p>
            </div>
          </div>
          <div className="cta" data-h="cta">
            <button className="btn btn-solid" type="button" onClick={onBookDemo}>Book a demo</button>
            <a className="btn btn-ghost" href="#action">See how it works</a>
          </div>
          <div className="meta" data-h="meta">Private beta · Australian construction &amp; labour hire</div>
        </div>
      </div>
      <button className="nav-arrow prev" type="button" aria-label="Previous slide" onClick={() => userStep(-1)}>&#8249;</button>
      <button className="nav-arrow next" type="button" aria-label="Next slide" onClick={() => userStep(1)}>&#8250;</button>
      <div className="dots">
        <div className="row" id="dots">
          {Array.from({ length: SLIDE_COUNT }, (_, n) => (
            <button
              key={n}
              className={slide === n ? 'dot on' : 'dot'}
              type="button"
              aria-label={`Go to slide ${n + 1}`}
              onClick={() => user(n)}
            >
              <i />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
