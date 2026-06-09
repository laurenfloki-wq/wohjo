// Remotion composition — the WLES seal forming.
//
// Drives the one signature motion moment on the landing page (§7): a
// receipt assembling, its SHA-256 hash pair resolving out of scramble,
// then "SEALED · WLES v1.0" stamping in. Played frame-by-frame by a
// single lazy <Player> (see SealPlayer.tsx); never rendered to a
// committed binary.
//
// Synthetic data only. Colours come from the shared landing tokens — the
// same source the page <style> is generated from — so nothing is
// re-picked here.

import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { landingTokens as C } from '@/styles/landing-tokens';

export const SEAL_FPS = 30;
export const SEAL_DURATION = 156;
export const SEAL_WIDTH = 720;
export const SEAL_HEIGHT = 860;

const HASH_LINE_1 = 'a3b5c7d2f819e4b0c1d23a4f5e6b789c';
const HASH_LINE_2 = '0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a';
const HEX = '0123456789abcdef';

const FONT_DISPLAY = "'Barlow Condensed', 'Archivo Narrow', system-ui, sans-serif";
const FONT_SANS = "'Barlow', 'Inter', system-ui, sans-serif";
const FONT_MONO = "'JetBrains Mono', 'SF Mono', ui-monospace, monospace";

// Deterministic per-character scramble: before a char's settle frame it
// shows a frame-derived hex digit; after, the final character. No
// Math.random, so the loop is reproducible.
function scramble(text: string, frame: number, startFrame: number, perChar: number) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const settle = startFrame + i * perChar;
    if (frame >= settle) {
      out += text[i];
    } else if (frame >= startFrame - 6) {
      out += HEX[(i * 7 + frame * 3 + i) % 16];
    } else {
      out += '·';
    }
  }
  return out;
}

const Row: React.FC<{
  frame: number;
  at: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ frame, at, children, style }) => {
  const opacity = interpolate(frame, [at, at + 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const y = interpolate(frame, [at, at + 10], [12, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return <div style={{ opacity, transform: `translateY(${y}px)`, ...style }}>{children}</div>;
};

export const SealComposition: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cardScale = spring({
    frame,
    fps,
    config: { damping: 18, mass: 0.7 },
    durationInFrames: 22,
  });
  const cardOpacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' });

  const hashStart = 46;
  const hashEnd = hashStart + HASH_LINE_1.length * 1.2;
  const line1 = scramble(HASH_LINE_1, frame, hashStart, 1.2);
  const line2 = scramble(HASH_LINE_2, frame, hashStart + 6, 1.2);

  const stampAt = Math.round(hashEnd) + 4;
  const stampProgress = spring({
    frame: frame - stampAt,
    fps,
    config: { damping: 12, mass: 0.6 },
    durationInFrames: 20,
  });
  const stampScale = interpolate(stampProgress, [0, 1], [1.4, 1]);
  const stampOpacity = interpolate(frame, [stampAt, stampAt + 8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const pillOpacity = interpolate(frame, [stampAt + 8, stampAt + 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: C.paper,
        fontFamily: FONT_SANS,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 560,
          background: C.surface,
          borderRadius: 18,
          padding: '52px 48px 44px',
          textAlign: 'center',
          position: 'relative',
          transform: `scale(${cardScale})`,
          opacity: cardOpacity,
          boxShadow: '0 2px 6px rgba(15,15,16,0.06), 0 40px 90px -40px rgba(15,15,16,0.30)',
        }}
      >
        {/* Seal stamp */}
        <div
          style={{
            position: 'absolute',
            top: 34,
            right: 34,
            width: 132,
            height: 132,
            transform: `rotate(-8deg) scale(${stampScale})`,
            opacity: stampOpacity,
          }}
        >
          <svg viewBox="0 0 96 96" width={132} height={132}>
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

        <Row
          frame={frame}
          at={8}
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: C.muted,
            marginBottom: 10,
          }}
        >
          FLOSTRUCTION
        </Row>
        <Row
          frame={frame}
          at={14}
          style={{
            fontFamily: FONT_MONO,
            fontSize: 20,
            letterSpacing: '0.08em',
            color: C.ink,
            marginBottom: 26,
          }}
        >
          FSTR-7P2K9Q
        </Row>
        <Row
          frame={frame}
          at={20}
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 60,
            fontWeight: 700,
            color: C.ink,
            lineHeight: 1,
            marginBottom: 18,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          8 h 2 m
        </Row>
        <Row frame={frame} at={26} style={{ marginBottom: 26 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 600, color: C.ink }}>
            Sample Worker
          </div>
          <div style={{ fontFamily: FONT_SANS, fontSize: 15, color: C.muted, marginTop: 4 }}>
            Westgate Tower · L9
          </div>
          <div style={{ fontFamily: FONT_SANS, fontSize: 14, color: C.muted, marginTop: 8 }}>
            Thu 23 Apr 2026 · 07:00–15:32
          </div>
        </Row>

        <Row
          frame={frame}
          at={38}
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: C.muted,
            marginBottom: 8,
          }}
        >
          SHA-256 · WLES v1.0 canonical
        </Row>
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 16,
            color: frame >= hashEnd ? C.ink : C.muted,
            lineHeight: 1.6,
            letterSpacing: '0.04em',
          }}
        >
          <div>{line1}</div>
          <div>{line2}</div>
        </div>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 28,
            padding: '8px 18px',
            borderRadius: 9999,
            background: C.forestSoft,
            color: C.forest,
            fontFamily: FONT_SANS,
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: '0.04em',
            opacity: pillOpacity,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
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
    </AbsoluteFill>
  );
};
