// WLES hash chain — build, then the tamper demonstration
// (flostruction-v5.html:637-652 markup, 774-811 behaviour).
// Deliberately vanilla: CSS transitions + IO + setTimeout chains
// (brief: do not "upgrade" to GSAP). Blocks pop in at 430 ms stagger;
// ~1.1 s after the build completes the tamper plays; replay resets.
// Horizontal scroll on narrow viewports via .blocks overflow-x.
'use client';

import { useCallback, useEffect, useRef } from 'react';
import { RevealSection } from './RevealSection';

interface BlockData { name: string; sub: string; hash: string }
const ED: BlockData = { name: 'CLOCK_OFF*', sub: '16:45:00 — edited', hash: 'd00d…beef' };
const OG: BlockData = { name: 'CLOCK_OFF', sub: '15:32:18', hash: '41c9…ae52' };

const BLOCKS: { name: string; sub: string; hash: string; prev: string }[] = [
  { name: 'CLOCK_ON', sub: '07:00:04', hash: '9f3a…c41d', prev: 'genesis' },
  { name: 'GEOFENCE_HIGH', sub: '07:00:09', hash: 'b82e…77f0', prev: '9f3a…c41d' },
  { name: 'CLOCK_OFF', sub: '15:32:18', hash: '41c9…ae52', prev: 'b82e…77f0' },
  { name: 'SUPERVISOR_OK', sub: '15:44:02', hash: 'e6d1…0b3c', prev: '41c9…ae52' },
  { name: 'EXPORT_SEALED', sub: '16:00:00', hash: '7a44…f9e8', prev: 'e6d1…0b3c' },
];

const LinkArrow = () => (
  <span className="lnk">
    <svg viewBox="0 0 44 20" aria-hidden="true">
      <line className="ln1" x1="2" y1="10" x2="34" y2="10" />
      <path className="ar" d="M31 4l8 6-8 6" />
      <text className="x" x="20" y="8" textAnchor="middle">&#10005;</text>
    </svg>
  </span>
);

export function ChainSection() {
  const secRef = useRef<HTMLElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rmRef = useRef(false);

  const wait = useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(setTimeout(fn, ms));
  }, []);

  const setBlk = (b: Element, d: BlockData) => {
    const bn = b.querySelector('.bn');
    const bs = b.querySelector('.bs');
    const bh = b.querySelector('.bh');
    if (bn) bn.textContent = d.name;
    if (bs) bs.textContent = d.sub;
    if (bh) bh.textContent = d.hash;
  };

  const play = useCallback(() => {
    const sec = secRef.current;
    if (!sec) return;
    const blks = [...sec.querySelectorAll('.blk')];
    const lnks = [...sec.querySelectorAll('.lnk')];

    const tamper = () => {
      sec.classList.add('tampered');
      blks[2].classList.add('edited');
      setBlk(blks[2], ED);
      blks[3].classList.add('broken');
      blks[4].classList.add('broken');
      const bp3 = blks[3].querySelector('.bp');
      if (bp3) bp3.innerHTML = 'prev: <b>MISMATCH</b>';
      lnks[2].classList.add('broken');
      lnks[3].classList.add('broken');
    };

    if (rmRef.current) {
      blks.forEach((b) => b.classList.add('in'));
      lnks.forEach((l) => l.classList.add('in'));
      tamper();
      return;
    }
    /* reset — the prototype's reset() checklist (lines 784-791) */
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    sec.classList.remove('tampered');
    blks.forEach((b) => b.classList.remove('in', 'edited', 'broken'));
    lnks.forEach((l) => l.classList.remove('in', 'broken'));
    setBlk(blks[2], OG);
    const bp3 = blks[3].querySelector('.bp');
    if (bp3) bp3.innerHTML = 'prev: <b>41c9…ae52</b>';

    blks.forEach((b, i) => wait(() => b.classList.add('in'), 250 + i * 430));
    lnks.forEach((l, i) => wait(() => l.classList.add('in'), 250 + i * 430 + 390));
    wait(tamper, 250 + blks.length * 430 + 1100);
  }, [wait]);

  useEffect(() => {
    rmRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sec = secRef.current;
    if (!sec) return;
    let io: IntersectionObserver | null = null;
    if ('IntersectionObserver' in window && !rmRef.current) {
      let done = false;
      io = new IntersectionObserver(
        (es) => es.forEach((e) => { if (e.isIntersecting && !done) { done = true; play(); } }),
        { threshold: 0.35 },
      );
      io.observe(sec);
    } else {
      play();
    }
    const timers = timersRef.current;
    return () => { io?.disconnect(); timers.forEach(clearTimeout); };
  }, [play]);

  return (
    <section className="chainsec" id="chain" ref={secRef}>
      <RevealSection className="chead">
        <span className="eyebrow reveal d1">One shift · one chain of evidence</span>
        <div className="chainhead reveal d2">
          <h2 className="ch-a">Every event, <span style={{ color: 'var(--gold)' }}>hash-chained.</span></h2>
          <h2 className="ch-b">Change one record —</h2>
        </div>
      </RevealSection>
      <div className="blocks">
        {BLOCKS.map((b, i) => (
          <span key={b.name} style={{ display: 'contents' }}>
            <div className="blk" data-i={i}>
              <div className="bn">{b.name}</div>
              <div className="bs">{b.sub}</div>
              <div className="bh">{b.hash}</div>
              <div className="bp">prev: <b>{b.prev}</b></div>
            </div>
            {i < BLOCKS.length - 1 ? <LinkArrow /> : null}
          </span>
        ))}
      </div>
      <p className="chainsub">— and every link after it <b>shows the break.</b></p>
      <div className="wlesline">
        <div className="w1">Built on WLES — the open Workforce Ledger Evidentiary Standard</div>
        <div className="w2">Open. Royalty-free. Verifiable by anyone — not just by us.</div>
      </div>
      <div className="chainctl"><button className="ctl" type="button" onClick={play}>Replay</button></div>
    </section>
  );
}
