// THE SCENE — worker ends shift -> dashboard reacts -> supervisor
// approves by SMS -> the record seals everywhere at once.
//
// Direct port of flostruction-v5.html:836-1002. Deliberately vanilla:
// CSS transitions + IntersectionObserver + setTimeout chains mutating
// the DOM imperatively, exactly like the prototype script. Elements
// are addressed by data-scene attributes inside the section root (the
// React components render only the INITIAL resting state, so SSR
// markup matches the prototype's). Do not migrate to GSAP — a
// once:true interaction bug was found and removed during prototyping
// (brief, Architecture Decisions "Engine").
//
// Beat sheet (brief, THE SCENE): 400 touch-in / 1150 press / 2650
// release / 3000 dashboard reacts / 3550-9900 SMS / 10550 the seal,
// everywhere at once / 11100 sealed-hours tags. Reduced motion
// renders finalState() with no animation.
'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { type SceneAudio } from './sceneTypes';

const HEX = '0123456789abcdef';
const START_SECS = 8 * 3600 + 1 * 60 + 48; // 8:01:48
const SEALED_HASH = '7f2c91ab44d0e6c8b35fa1d92e08c4b1';
const YESTERDAY_HASH = 'a3b5c7d2f819e4b0c1d23a43e3c1e530';

function fmt(s: number): string {
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const x = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${x}`;
}

export interface SceneController {
  /** Replay control — resets every piece of scene state, then plays. */
  replay: () => void;
}

export function useSceneOrchestrator(
  rootRef: RefObject<HTMLElement | null>,
  audio: SceneAudio,
): SceneController {
  const replayRef = useRef<() => void>(() => {});

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const $ = <T extends HTMLElement = HTMLElement>(name: string): T | null =>
      root.querySelector<T>(`[data-scene="${name}"]`);

    const timerEl = $('timer'), dashT = $('dashtimer'), pill = $('pill'),
      pillTxt = $('pilltxt'), ci = $('ci'), hold = $('hold'), holdTxt = $('holdtxt'),
      touch = $('touch'), rlab = $('rlab'), rid = $('rid'), rsite = $('rsite'),
      rhrs = $('rhrs'), chip = $('chip'), chipTxt = $('chiptxt'), rhash = $('rhash'),
      thread = $('thread'), typing = $('typing'), tags = $('tags'), dstat = $('dstat'),
      kVer = $('kver'), kSite = $('ksite'), kSeal = $('kseal'), rec = $('rec'),
      surfaces = $('surfaces');
    const sealstamp = root.querySelector<SVGSVGElement>('[data-scene="sealstamp"]');
    if (!thread || !typing || !surfaces) return;

    const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const steps = [...thread.querySelectorAll<HTMLElement>('[data-step]')].sort(
      (a, b) => Number(a.dataset.step) - Number(b.dataset.step),
    );

    /* --- hash scramble (pitch-style) — prototype lines 876-884 --- */
    function scrambleTo(el: HTMLElement, target: string, ms: number) {
      if (RM) { el.textContent = target; return; }
      const t0 = performance.now();
      const n = target.length;
      const f = (now: number) => {
        const p = Math.min(1, (now - t0) / ms);
        let out = '';
        for (let i = 0; i < n; i++) out += i / n < p ? target[i] : HEX[Math.floor(Math.random() * 16)];
        el.textContent = out;
        if (p < 1) requestAnimationFrame(f);
        else el.textContent = target;
      };
      f(t0);
    }

    /* --- count-up helper — prototype lines 886-892 --- */
    function count(el: HTMLElement, from: number, to: number, ms: number, dec: number) {
      const t0 = performance.now();
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
      const f = (now: number) => {
        const p = Math.min(1, (now - t0) / ms);
        el.textContent = (from + (to - from) * p).toFixed(dec);
        if (p < 1) requestAnimationFrame(f);
      };
      f(t0);
    }

    /* --- timeline plumbing — prototype lines 894-917 --- */
    let timers: ReturnType<typeof setTimeout>[] = [];
    let tickHandle: ReturnType<typeof setInterval> | null = null;
    let secs = START_SECS;
    const wait = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));
    function stopTick() { if (tickHandle) { clearInterval(tickHandle); tickHandle = null; } }
    function startTick() {
      stopTick();
      secs = START_SECS;
      if (timerEl) timerEl.textContent = fmt(secs);
      if (dashT) dashT.textContent = '8:01';
      if (RM) return;
      tickHandle = setInterval(() => {
        secs++;
        if (timerEl) timerEl.textContent = fmt(secs);
        if (dashT) dashT.textContent = `${Math.floor(secs / 3600)}:${String(Math.floor((secs % 3600) / 60)).padStart(2, '0')}`;
      }, 1000);
    }
    function setChip(mode: 'sealed' | 'await' | 'stamp', text: string) {
      if (!chip || !chipTxt) return;
      chip.classList.remove('await', 'stamp');
      if (mode === 'await') chip.classList.add('await');
      if (mode === 'stamp') { void chip.offsetWidth; chip.classList.add('stamp'); }
      chipTxt.textContent = text;
    }
    function dashStatus(mode: 'live' | 'wait' | 'sealed') {
      if (!dstat) return;
      dstat.innerHTML =
        mode === 'live' ? '<span class="chip live"><i></i>LIVE</span>'
        : mode === 'wait' ? '<span class="chip wait">AWAITING SMS</span>'
        : '<span class="chip sealed"><i></i>WLES SEALED</span>';
    }

    /* --- states — prototype resetScene() (the reset checklist,
           lines 920-935) and finalState() (lines 936-948) --- */
    function resetScene() {
      timers.forEach(clearTimeout); timers = [];
      steps.forEach((s) => s.classList.remove('in'));
      if (typing) { typing.classList.remove('in'); typing.style.display = ''; }
      tags?.classList.remove('done');
      if (touch) touch.className = 'touch';
      hold?.classList.remove('pressing', 'filling');
      if (holdTxt) holdTxt.textContent = 'Hold to end shift';
      if (pill) pill.className = 'lpill';
      if (pillTxt) pillTxt.textContent = 'LIVE';
      if (ci) ci.textContent = 'clocked on 07:00 · gps locked';
      if (rlab) rlab.textContent = 'Last shift · sealed';
      if (rid) rid.textContent = 'FSTR-7P2K9Q';
      if (rsite) rsite.textContent = 'Wed 22 Apr · Westgate Tower L9';
      if (rhrs) rhrs.textContent = '7 h 58 m';
      setChip('sealed', 'WLES SEALED');
      if (rhash) rhash.textContent = YESTERDAY_HASH;
      sealstamp?.classList.remove('on');
      dashStatus('live');
      if (kVer) kVer.textContent = '412.5';
      if (kSite) kSite.textContent = '3';
      if (kSeal) kSeal.textContent = '96';
      if (rec) rec.textContent = '96';
      startTick();
    }
    function finalState() {
      stopTick();
      if (timerEl) timerEl.textContent = '8:02:00';
      if (dashT) dashT.textContent = '8:02';
      pill?.classList.add('ended');
      if (pillTxt) pillTxt.textContent = 'ENDED';
      if (ci) ci.textContent = 'ended 15:32 · sent for approval';
      if (holdTxt) holdTxt.textContent = 'Shift ended';
      if (rlab) rlab.textContent = 'Today · Westgate Tower L9';
      if (rid) rid.textContent = 'FSTR-9T4W2L';
      if (rsite) rsite.textContent = 'Thu 23 Apr · Westgate Tower L9';
      if (rhrs) rhrs.textContent = '8 h 02 m';
      setChip('sealed', 'WLES SEALED');
      if (rhash) rhash.textContent = SEALED_HASH;
      sealstamp?.classList.add('on');
      steps.forEach((s) => s.classList.add('in'));
      if (typing) typing.style.display = 'none';
      tags?.classList.add('done');
      dashStatus('sealed');
      if (kVer) kVer.textContent = '420.5';
      if (kSite) kSite.textContent = '2';
      if (kSeal) kSeal.textContent = '97';
      if (rec) rec.textContent = '97';
    }

    const show = (el: HTMLElement | undefined, snd?: 'tx' | 'rx') => {
      el?.classList.add('in');
      if (snd === 'tx') audio.sndTx();
      else if (snd === 'rx') audio.sndRx();
    };
    const typingOn = () => { typing.classList.add('in'); thread.appendChild(typing); };
    const typingOff = () => typing.classList.remove('in');

    function play() {
      if (RM) { finalState(); return; }
      resetScene();
      let t = 400;
      /* ACT 1 — the worker ends the shift (tap-and-hold indicator) */
      wait(() => touch?.classList.add('in'), t);
      t += 650;
      wait(() => { touch?.classList.add('pressing'); hold?.classList.add('pressing', 'filling'); audio.sndHold(); }, t);
      t += 1500;
      wait(() => {
        /* hold complete */
        touch?.classList.remove('pressing');
        touch?.classList.add('out');
        hold?.classList.remove('pressing', 'filling');
        stopTick();
        if (timerEl) timerEl.textContent = '8:02:00';
        pill?.classList.add('ended');
        if (pillTxt) pillTxt.textContent = 'ENDED';
        if (ci) ci.textContent = 'ended 15:32 · sent for approval';
        if (holdTxt) holdTxt.textContent = 'Shift ended';
        /* today's record appears, pending */
        if (rlab) rlab.textContent = 'Today · Westgate Tower L9';
        if (rid) rid.textContent = 'FSTR-9T4W2L';
        if (rsite) rsite.textContent = 'Thu 23 Apr · Westgate Tower L9';
        if (rhrs) rhrs.textContent = '8 h 02 m';
        setChip('await', 'AWAITING APPROVAL');
        if (rhash) rhash.textContent = 'pending · seals on approval';
      }, t);
      /* ACT 2 — the dashboard sees it instantly */
      t += 350;
      wait(() => {
        dashStatus('wait');
        if (dashT) dashT.textContent = '8:02';
        if (kSite) count(kSite, 3, 2, 500, 0);
      }, t);
      /* ACT 3 — the supervisor approves by SMS */
      t += 550; wait(() => show(steps[0]), t);
      t += 450; wait(typingOn, t);
      t += 1300; wait(() => { typingOff(); show(steps[1], 'rx'); }, t);
      t += 1750; wait(() => show(steps[2], 'tx'), t);
      t += 450; wait(() => show(steps[3]), t);
      t += 700; wait(typingOn, t);
      t += 1300; wait(() => { typingOff(); show(steps[4], 'rx'); }, t);
      /* ACT 4 — the record seals everywhere */
      t += 650;
      wait(() => {
        setChip('stamp', 'WLES SEALED');
        audio.sndSeal();
        sealstamp?.classList.add('on');
        if (rhash) scrambleTo(rhash, SEALED_HASH, 1200);
        dashStatus('sealed');
        if (kVer) count(kVer, 412.5, 420.5, 700, 1);
        if (kSeal) count(kSeal, 96, 97, 500, 0);
        if (rec) rec.textContent = '97';
      }, t);
      t += 550;
      wait(() => tags?.classList.add('done'), t);
    }

    replayRef.current = () => { audio.ac(); play(); };

    startTick();
    let io: IntersectionObserver | null = null;
    if ('IntersectionObserver' in window && !RM) {
      let played = false;
      io = new IntersectionObserver(
        (es) => es.forEach((e) => {
          /* Desktop strip: fire at 40% of the section visible (the
             prototype trigger). Stacked phone layout: the strip is
             ~3x taller than the viewport so 40% can never be visible
             — fire when the strip covers most of the viewport instead
             (the worker phone is then in view). Approved by Lauren
             2026-06-10; same 700 ms grace, same beat sheet. */
          const coversViewport = e.intersectionRect.height >= 0.55 * window.innerHeight;
          if ((e.intersectionRatio >= 0.4 || coversViewport) && !played) {
            played = true;
            wait(play, 700); /* 700 ms grace — brief, THE SCENE */
          }
        }),
        { threshold: [0, 0.1, 0.2, 0.3, 0.4] },
      );
      io.observe(surfaces);
    } else {
      finalState();
    }

    return () => {
      io?.disconnect();
      timers.forEach(clearTimeout);
      stopTick();
    };
    // The audio callbacks are stable (useCallback with stable deps);
    // the scene mounts once with the section.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { replay: () => replayRef.current() };
}
