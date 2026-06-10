// THE SCENE section — "See it in action" (flostruction-v5.html:484-632).
// Owns the three frames, the SceneOrchestrator and the scene controls.
//
// Engine split (brief, Architecture Decisions): the rise-and-settle
// entrance and scroll drift are GSAP/ScrollTrigger (this file, via
// gsap.matchMedia tiers); the scene itself is deliberately vanilla
// (useSceneOrchestrator — CSS transitions + IO + setTimeout chains).
'use client';

import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap, ScrollTrigger, MM } from '@/lib/motion/gsap-client';
import { useSceneAudio } from './useSceneAudio';
import { useSceneOrchestrator } from './useSceneOrchestrator';
import { WorkerPhone } from './devices/WorkerPhone';
import { SmsPhone } from './devices/SmsPhone';
import { DashboardFrame } from './devices/DashboardFrame';
import { RevealSection } from './RevealSection';

export function Surfaces() {
  const rootRef = useRef<HTMLElement>(null);

  const audio = useSceneAudio();
  const scene = useSceneOrchestrator(rootRef, audio);

  // Surfaces choreography: rise-and-settle + scroll drift (no twirl) —
  // flostruction-v5.html:746-758, wrapped in the MM tiers per the
  // marketing-route engine policy. Reduced tier: no GSAP state set, so
  // the frames render in place untouched.
  useGSAP(
    () => {
      const units = gsap.utils.toArray<HTMLElement>('#surfaces .unit');
      if (!units.length) return;
      const mm = gsap.matchMedia();

      const entrance = () => {
        gsap.set(units, {
          autoAlpha: 0, y: 90, rotateX: 6,
          transformPerspective: 1200, transformOrigin: '50% 100%',
        });
        ScrollTrigger.create({
          trigger: '#surfaces', start: 'top 78%', once: true,
          onEnter: () =>
            gsap.to(units, { autoAlpha: 1, y: 0, rotateX: 0, duration: 1.5, ease: 'expo.out', stagger: 0.16 }),
        });
      };

      mm.add(MM.full, () => {
        entrance();
        /* gentle depth drift, scrubbed to scroll — replaces the pointer twirl */
        units.forEach((u) => {
          const d = parseFloat(u.dataset.depth ?? '1') || 1;
          gsap.to(u, {
            y: -(d * 16), ease: 'none',
            scrollTrigger: { trigger: '#surfaces', start: 'top bottom', end: 'bottom top', scrub: 1.2 },
          });
        });
      });
      /* mobile tier: entrance only — no scrubbed parallax (engine policy) */
      mm.add(MM.mobile, () => { entrance(); });
    },
    { scope: rootRef },
  );

  return (
    <section className="action" id="action" ref={rootRef}>
      <RevealSection className="head">
        <span className="eyebrow reveal d1">See it in action</span>
        <h2 className="reveal d2">
          The app is the source. The SMS is the workflow.{' '}
          <span style={{ color: 'var(--signal)' }}>The dashboard is the control room.</span>
        </h2>
        <p className="reveal d3">
          One verified record per shift — captured on site, approved in seconds, sealed for good, and visible across every surface of your business.
        </p>
      </RevealSection>

      <div className="surfaces" id="surfaces" data-scene="surfaces">
        <WorkerPhone />
        <SmsPhone />
        <DashboardFrame />
      </div>

      <div className="scenectl">
        <button
          className={audio.soundOn ? 'ctl on' : 'ctl'}
          type="button"
          aria-pressed={audio.soundOn}
          onClick={audio.toggle}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z" /></svg>
          <span>{audio.soundOn ? 'Sound on' : 'Sound off'}</span>
        </button>
        <button className="ctl" type="button" onClick={scene.replay}>Replay scene</button>
      </div>
    </section>
  );
}
