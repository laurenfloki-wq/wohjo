// Web Audio scene tones — flostruction-v5.html:849-873, exact
// oscillator parameters. Off by default, user-gesture gated; the
// Sound toggle carries aria-pressed (brief, Componentisation).
'use client';

import { useCallback, useRef, useState } from 'react';
import { type SceneAudio } from './sceneTypes';

interface UseSceneAudioResult extends SceneAudio {
  soundOn: boolean;
  toggle: () => void;
}

export function useSceneAudio(): UseSceneAudioResult {
  const ctxRef = useRef<AudioContext | null>(null);
  const soundOnRef = useRef(false);
  const [soundOn, setSoundOn] = useState(false);

  const ac = useCallback(() => {
    if (!ctxRef.current) {
      const A = window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (A) ctxRef.current = new A();
    }
    if (ctxRef.current && ctxRef.current.state === 'suspended') {
      void ctxRef.current.resume();
    }
  }, []);

  const tone = useCallback(
    (f0: number, f1: number, t0: number, dur: number, peak: number, type?: OscillatorType) => {
      ac();
      const c = ctxRef.current;
      if (!c) return;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type ?? 'sine';
      o.frequency.setValueAtTime(f0, c.currentTime + t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), c.currentTime + t0 + dur);
      g.gain.setValueAtTime(0.0001, c.currentTime + t0);
      g.gain.exponentialRampToValueAtTime(peak, c.currentTime + t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + dur);
      o.connect(g).connect(c.destination);
      o.start(c.currentTime + t0);
      o.stop(c.currentTime + t0 + dur + 0.05);
    },
    [ac],
  );

  /* tx swoop / rx two-tone / seal thud / hold tick — params verbatim */
  const sndTx = useCallback(() => { if (soundOnRef.current) tone(620, 1180, 0, 0.16, 0.16); }, [tone]);
  const sndRx = useCallback(() => {
    if (soundOnRef.current) { tone(1318, 1318, 0, 0.12, 0.14); tone(1108, 1108, 0.10, 0.20, 0.12); }
  }, [tone]);
  const sndSeal = useCallback(() => {
    if (soundOnRef.current) { tone(220, 90, 0, 0.22, 0.20, 'triangle'); tone(880, 880, 0.05, 0.10, 0.06); }
  }, [tone]);
  const sndHold = useCallback(() => { if (soundOnRef.current) tone(440, 660, 0, 0.10, 0.07); }, [tone]);

  const toggle = useCallback(() => {
    soundOnRef.current = !soundOnRef.current;
    ac();
    setSoundOn(soundOnRef.current);
    if (soundOnRef.current) {
      tone(1318, 1318, 0, 0.12, 0.14);
      tone(1108, 1108, 0.10, 0.20, 0.12);
    }
  }, [ac, tone]);

  return { ac, sndTx, sndRx, sndSeal, sndHold, soundOn, toggle };
}
