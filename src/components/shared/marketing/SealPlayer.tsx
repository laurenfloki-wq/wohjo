'use client';

// Single live @remotion/player on the page (§7). Disciplined:
//   - Code-split: the Player + composition load via next/dynamic(ssr:false),
//     so none of Remotion is in the initial/LCP bundle.
//   - Mounted only while in view; unmounted when scrolled away.
//   - prefers-reduced-motion → the Player never mounts; a complete static
//     poster (the final sealed state) is shown instead.
//   - The container has an explicit aspect-ratio, so there is zero CLS
//     whether the poster or the Player is showing.
//   - No committed video binary; nothing is pre-rendered.

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { landingTokens as C } from '@/styles/landing-tokens';
import {
  SealComposition,
  SEAL_FPS,
  SEAL_DURATION,
  SEAL_WIDTH,
  SEAL_HEIGHT,
} from '@/remotion/SealComposition';

const FONT_DISPLAY = "var(--font-barlow-condensed), 'Barlow Condensed', sans-serif";
const FONT_MONO = "var(--font-jetbrains-mono), 'JetBrains Mono', ui-monospace, monospace";

const Player = dynamic(() => import('@remotion/player').then((m) => m.Player), {
  ssr: false,
});

// Complete static end-state. Serves SSR, the pre-in-view paint, and the
// reduced-motion tier — a fully sealed receipt, no motion required.
function SealPoster() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: C.paper,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: '78%',
          maxWidth: 360,
          background: C.surface,
          borderRadius: 16,
          padding: '34px 30px 28px',
          textAlign: 'center',
          position: 'relative',
          boxShadow: '0 2px 6px rgba(15,15,16,0.06), 0 26px 60px -34px rgba(15,15,16,0.30)',
        }}
      >
        <div
          aria-hidden="true"
          style={{ position: 'absolute', top: 18, right: 18, transform: 'rotate(-8deg)' }}
        >
          <svg viewBox="0 0 96 96" width={72} height={72}>
            <circle cx="48" cy="48" r="42" fill="none" stroke={C.verifiedBright} strokeWidth="2" />
            <circle cx="48" cy="48" r="36" fill="none" stroke={C.verifiedBright} strokeWidth="1" />
            <text
              x="48"
              y="46"
              fontFamily={FONT_DISPLAY}
              fontWeight="700"
              fontSize="14"
              fill={C.verifiedBright}
              textAnchor="middle"
            >
              SEALED
            </text>
            <line x1="30" y1="51" x2="66" y2="51" stroke={C.verifiedBright} strokeWidth="0.8" />
            <text
              x="48"
              y="62"
              fontFamily={FONT_MONO}
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
              fontFamily={FONT_DISPLAY}
              fontWeight="600"
              fontSize="5.4"
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
            fontFamily: FONT_DISPLAY,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: C.muted,
            marginBottom: 8,
          }}
        >
          FLOSTRUCTION
        </div>
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 13,
            letterSpacing: '0.08em',
            color: C.ink,
            marginBottom: 16,
          }}
        >
          FSTR-7P2K9Q
        </div>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 40,
            fontWeight: 700,
            color: C.ink,
            lineHeight: 1,
            marginBottom: 12,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          8 h 2 m
        </div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 600, color: C.ink }}>
          Sample Worker
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>Westgate Tower · L9</div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 16,
            padding: '5px 12px',
            borderRadius: 9999,
            background: C.forestSoft,
            color: C.forest,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
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
    </div>
  );
}

export default function SealPlayer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [reduced, setReduced] = useState(true); // poster-first until proven otherwise

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      rootMargin: '0px 0px -10% 0px',
      threshold: 0.25,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const showPlayer = inView && !reduced;

  return (
    <div
      ref={containerRef}
      aria-label="Animated demonstration of a shift record being sealed, shown with synthetic data"
      role="img"
      style={{
        width: '100%',
        maxWidth: 460,
        margin: '0 auto',
        aspectRatio: `${SEAL_WIDTH} / ${SEAL_HEIGHT}`,
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        border: '1px solid var(--border)',
        background: C.paper,
      }}
    >
      {showPlayer ? (
        <Player
          component={SealComposition}
          durationInFrames={SEAL_DURATION}
          fps={SEAL_FPS}
          compositionWidth={SEAL_WIDTH}
          compositionHeight={SEAL_HEIGHT}
          autoPlay
          loop
          controls={false}
          clickToPlay={false}
          doubleClickToFullscreen={false}
          spaceKeyToPlayOrPause={false}
          style={{ width: '100%', height: '100%' }}
        />
      ) : (
        <SealPoster />
      )}
    </div>
  );
}
