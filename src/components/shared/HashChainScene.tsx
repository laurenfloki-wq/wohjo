// HashChainScene — interactive WLES tamper-cascade demo (Phase 3b).
//
// What it shows:
//   Six chained blocks. Each block stores the hash of its predecessor.
//   Tamper any block → its hash recomputes → every block after it is
//   no longer self-consistent (their stored prev-hash mismatches what
//   the chain actually contains). The cascade is the point: a single
//   alteration invalidates everything downstream.
//
// Why it lives here:
//   The "02 Verify" solution card claims tamper-evident hash chains.
//   This component is the demonstration. Placed as a dedicated section
//   between #solution and <MarketingScreenshots />, so the cards make
//   the claim and the demo proves it without rewriting the IA.
//
// Render path — SVG (brief §1 mobile-tier substitution):
//   Two independent upstream incompatibilities forced the SVG path
//   to ship as the sole renderer. Both are documented as brief
//   Stop-and-Report findings (see docs/phase-3-3d-report.md).
//
//   (1) next/dynamic({ ssr: false }) ANY child crashes inside
//       LandingPage's render tree under Next 16.2.3 Turbopack +
//       React 19.2.4. Reproduced with a trivial `<div data-x>x</div>`.
//       React DOM throws insertBefore NotFoundError. The same
//       dynamic mount on a standalone test route works. Workaround:
//       static import of HashChainScene.
//   (2) R3F's <Canvas> also fails to mount in LandingPage's tree
//       (drei <Html> portal + bundled-reconciler bridge insertBefore).
//       Even with #1 worked around via static import, the WebGL
//       path crashes hydration. <Canvas> mounts cleanly on a
//       standalone probe route — confirmed.
//
//   Brief authorisation: "Mobile tier substitution may be required.
//   …substitute an SVG/2D fallback for the mobile tier." This file
//   ships the SVG renderer as the sole path; it is informationally
//   complete (broken blocks have a cross-icon and geometric link
//   fracture; the post-tamper static state conveys the cascade
//   without motion). The WebGL path remains a follow-up.
//
// Engine isolation discipline (brief §1):
//   - No Three.js imports anywhere on the marketing surface — the
//     three / @react-three/* deps are not installed.
//   - HashChainScene is statically imported from LandingPage (the
//     dynamic path crashes per #1). Bundle isolation is preserved
//     implicitly by route boundary: LandingPage is mounted only by
//     src/app/page.tsx (the `/` route), so non-marketing route
//     bundles never include LandingPage and never ship HashChainScene.
//     Verified via per-route build manifests in .next/server/app/*.
//   - usePathname() runtime guard as defence-in-depth: if mounted
//     off / (e.g. a future test route imports it), returns null.
//
// State model:
//   Single source of truth in React. Each block has a `salt` that
//   bumps when tampered; the deterministic hash function rolls
//   forward through the chain. `tamperedIndex` records the earliest
//   alteration; broken = i > tamperedIndex. Reset clears it.
//
// Hash function:
//   Not real SHA-256 — this is a visual claim, not a verification
//   surface, and we need synchronous determinism. Tiny djb2-derived
//   mixer producing 8 hex chars. The point conveyed is structural:
//   altering input → altered output → cascade. The real WLES uses
//   real SHA-256 server-side; the receipt mockup elsewhere on the
//   page shows the full 64-char hex.

'use client';

import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { usePathname } from 'next/navigation';

// ─── Palette (matches LandingPage's CSS-vars in #solution scope) ───
export const CHAIN_COLORS = {
  ink: '#0e0c09',
  amber: '#c8530a',
  cream: '#f5f0e8',
  light: '#faf7f2',
  muted: '#7a6f60',
  // Verification-state secondary signals. Shape is the primary
  // signal (tick vs cross icon, fractured vs straight link); colour
  // is the secondary signal per brief §1 accessibility rule.
  verified: '#2d5f3f',
  altered: '#c8530a',
  broken: '#8b3a3a',
} as const;

const MARKETING_PATH = '/';
const BLOCK_COUNT = 6;
const GENESIS_PREV = '00000000';

// ─── Synthetic block data ───
// FSTR-* shift IDs follow the same vocabulary as the receipt mockup
// on this page. Times are plausible Sydney CBD construction shifts.
const SHIFT_IDS = [
  'FSTR-2026-04-23-001',
  'FSTR-2026-04-23-002',
  'FSTR-2026-04-24-001',
  'FSTR-2026-04-24-002',
  'FSTR-2026-04-25-001',
  'FSTR-2026-04-25-002',
] as const;

// ─── Hash mixer ───
// djb2 → finalising avalanche → 8 hex chars. Deterministic, fast,
// no crypto cost. Sufficient for visualisation; the claim about
// tamper-evidence rests on the chain structure, not the digest.
function djb2Hex(input: string): string {
  let h = 5381 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h = ((h * 33) ^ input.charCodeAt(i)) >>> 0;
  }
  h = ((h ^ (h >>> 16)) * 0x85ebca6b) >>> 0;
  h = ((h ^ (h >>> 13)) * 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}

export type BlockState = {
  index: number;
  shiftId: string;
  salt: number;
  hash: string;
  prevHash: string;
  broken: boolean;
  altered: boolean;
};

function buildChain(salts: readonly number[], tamperedIndex: number | null): BlockState[] {
  const blocks: BlockState[] = [];
  let prev = GENESIS_PREV;
  for (let i = 0; i < salts.length; i++) {
    const hash = djb2Hex(`${prev}:${SHIFT_IDS[i]}:${salts[i]}`);
    blocks.push({
      index: i,
      shiftId: SHIFT_IDS[i],
      salt: salts[i],
      hash,
      prevHash: prev,
      broken: tamperedIndex !== null && i > tamperedIndex,
      altered: tamperedIndex !== null && i === tamperedIndex,
    });
    prev = hash;
  }
  return blocks;
}

const INITIAL_SALTS: readonly number[] = Object.freeze(
  Array.from({ length: BLOCK_COUNT }, (_, i) => i + 1),
);

// ─── Mount gate ───
// Returns true on the marketing route, false elsewhere — but the
// gate is INLINE in render rather than effect-driven. The render-
// null-then-re-render-with-content pattern (return null on first
// render, useEffect → setState → render content) reliably triggers
// a React DOM insertBefore NotFoundError inside LandingPage's tree
// under Next 16.2.3 Turbopack + React 19.2.4. Reading pathname
// during render — same value on server and client for any given
// route — avoids the void→content transition entirely. This is
// safe because LandingPage is mounted only by src/app/page.tsx
// (`/`), so this guard is effectively defensive; it would short-
// circuit only if a future caller imported HashChainScene from a
// non-marketing route.
function useMarketingGate(): boolean {
  const pathname = usePathname();
  return pathname === MARKETING_PATH;
}

// ─── SVG fallback ───
// Used under reduced-motion, when WebGL is unavailable, and when the
// WebGL context is lost. Identical interaction semantics to the
// WebGL path: same DOM controls drive the same React state; the
// only difference is how the chain is drawn.
//
// Information completeness: the static post-tamper state of this
// component must convey the cascade. Broken blocks have a cross
// icon and a fractured link to their predecessor; the tampered
// block has an "altered" badge. None of these signals rely on
// colour alone.
function ChainFallbackSVG({ blocks }: { blocks: BlockState[] }) {
  // Layout: blocks laid out left-to-right with a small gap; links
  // are horizontal segments that visibly rotate off-axis when the
  // following block is broken.
  const blockW = 92;
  const blockH = 64;
  const gap = 22;
  const padX = 12;
  const padY = 28;
  const totalW = padX * 2 + BLOCK_COUNT * blockW + (BLOCK_COUNT - 1) * gap;
  const totalH = padY * 2 + blockH + 24;

  return (
    <svg
      viewBox={`0 0 ${totalW} ${totalH}`}
      width="100%"
      role="img"
      aria-label="Hash chain of six blocks, drawn in two dimensions"
      style={{ display: 'block', maxWidth: '100%' }}
    >
      {blocks.map((b, i) => {
        const x = padX + i * (blockW + gap);
        const y = padY;
        const linkX1 = x + blockW;
        const linkX2 = x + blockW + gap;
        const linkY = y + blockH / 2;
        // Fracture the link between i and i+1 when i+1 is broken.
        const nextBroken = i < blocks.length - 1 && blocks[i + 1].broken;
        const fill = b.altered
          ? CHAIN_COLORS.altered
          : b.broken
            ? CHAIN_COLORS.broken
            : CHAIN_COLORS.ink;
        const stroke = b.broken ? CHAIN_COLORS.broken : CHAIN_COLORS.amber;
        return (
          <g key={b.shiftId}>
            {/* Link to next block. Rotated and dimmed when broken;
                a thin gap segment makes the break structural. */}
            {i < blocks.length - 1 && (
              <g
                transform={nextBroken ? `rotate(-22 ${(linkX1 + linkX2) / 2} ${linkY})` : undefined}
              >
                <line
                  x1={linkX1}
                  y1={linkY}
                  x2={(linkX1 + linkX2) / 2 - (nextBroken ? 4 : 0)}
                  y2={linkY}
                  stroke={nextBroken ? CHAIN_COLORS.broken : CHAIN_COLORS.amber}
                  strokeWidth={nextBroken ? 1.5 : 2.5}
                  strokeLinecap="round"
                />
                <line
                  x1={(linkX1 + linkX2) / 2 + (nextBroken ? 4 : 0)}
                  y1={linkY}
                  x2={linkX2}
                  y2={linkY}
                  stroke={nextBroken ? CHAIN_COLORS.broken : CHAIN_COLORS.amber}
                  strokeWidth={nextBroken ? 1.5 : 2.5}
                  strokeLinecap="round"
                />
              </g>
            )}
            <rect
              x={x}
              y={y}
              width={blockW}
              height={blockH}
              rx={4}
              fill={fill}
              stroke={stroke}
              strokeWidth={b.altered ? 2 : 1}
            />
            <text
              x={x + 8}
              y={y + 16}
              fontFamily="'JetBrains Mono', ui-monospace, monospace"
              fontSize="8"
              fill={CHAIN_COLORS.cream}
              opacity={0.75}
            >
              {b.shiftId.slice(-6)}
            </text>
            <text
              x={x + 8}
              y={y + 36}
              fontFamily="'JetBrains Mono', ui-monospace, monospace"
              fontSize="13"
              fontWeight={600}
              fill={CHAIN_COLORS.cream}
              data-fallback-hash={i}
            >
              {b.hash}
            </text>
            {/* Verification glyph — shape is the primary signal.
                Tick for verified, cross for broken, exclamation
                in a hexagon for altered (caused the break). */}
            <g transform={`translate(${x + blockW - 18} ${y + blockH - 16})`}>
              {b.broken ? (
                <g stroke={CHAIN_COLORS.broken} strokeWidth="1.8" strokeLinecap="round">
                  <line x1="0" y1="0" x2="10" y2="10" />
                  <line x1="10" y1="0" x2="0" y2="10" />
                </g>
              ) : b.altered ? (
                <g>
                  <circle
                    cx="5"
                    cy="5"
                    r="6"
                    fill="none"
                    stroke={CHAIN_COLORS.altered}
                    strokeWidth="1.5"
                  />
                  <line
                    x1="5"
                    y1="1.5"
                    x2="5"
                    y2="6"
                    stroke={CHAIN_COLORS.altered}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <circle cx="5" cy="8.5" r="0.9" fill={CHAIN_COLORS.altered} />
                </g>
              ) : (
                <polyline
                  points="0,5 4,9 10,1"
                  fill="none"
                  stroke={CHAIN_COLORS.verified}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </g>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Public component ───
export default function HashChainScene() {
  const isMarketing = useMarketingGate();
  // Static id rather than useId(): a single HashChainScene per
  // page guarantees uniqueness and avoids the unnecessary hook
  // dependency.
  const liveRegionId = 'hash-chain-live-region';
  const [salts, setSalts] = useState<number[]>(() => [...INITIAL_SALTS]);
  const [tamperedIndex, setTamperedIndex] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const blocks = useMemo(() => buildChain(salts, tamperedIndex), [salts, tamperedIndex]);

  const handleTamper = useCallback((targetIndex: number) => {
    // Deterministic per-index salt offset: tamper(N) always
    // produces the same altered hash, regardless of how many
    // tamper/reset cycles preceded it. Required for the cascade
    // to be reproducible across cycles (brief acceptance).
    setSalts((prev) => {
      const next = [...prev];
      next[targetIndex] = INITIAL_SALTS[targetIndex] + 9999;
      return next;
    });
    setTamperedIndex(targetIndex);
    const lastIdx = BLOCK_COUNT - 1;
    const downstream =
      targetIndex === lastIdx
        ? 'No subsequent blocks affected.'
        : `Blocks ${targetIndex + 2} through ${lastIdx + 1} are now invalid.`;
    setAnnouncement(`Block ${targetIndex + 1} altered. ${downstream}`);
  }, []);

  const handleReset = useCallback(() => {
    setSalts([...INITIAL_SALTS]);
    setTamperedIndex(null);
    setAnnouncement('Chain reset. All six blocks verified.');
  }, []);

  if (!isMarketing) return null;

  return (
    <section id="hash-chain-demo" aria-labelledby="hash-chain-heading" style={SECTION_STYLE}>
      <div style={INNER_STYLE}>
        <div style={HEADER_STYLE}>
          <div style={TAG_STYLE}>Try it</div>
          <h2 id="hash-chain-heading" style={HEADLINE_STYLE}>
            Alter any block.
            <br />
            <span style={{ color: CHAIN_COLORS.amber }}>The chain after it breaks.</span>
          </h2>
          <p style={CAPTION_STYLE}>
            Each block stores the hash of the one before it. Change a block&apos;s data and every
            block downstream stops verifying.
          </p>
        </div>

        <div style={STAGE_STYLE}>
          <ChainFallbackSVG blocks={blocks} />
        </div>

        <div style={CONTROLS_WRAP_STYLE}>
          <div style={CONTROLS_ROW_STYLE} role="group" aria-label="Tamper controls">
            {blocks.map((b, i) => (
              <button
                key={b.shiftId}
                type="button"
                onClick={() => handleTamper(i)}
                aria-label={`Tamper with block ${i + 1} of ${BLOCK_COUNT}, shift ${b.shiftId}`}
                aria-pressed={tamperedIndex === i}
                data-block-index={i}
                data-hash={b.hash}
                data-broken={b.broken ? '1' : '0'}
                data-altered={b.altered ? '1' : '0'}
                style={tamperButtonStyle(tamperedIndex === i, b.broken)}
              >
                Block {i + 1}
              </button>
            ))}
          </div>
          <div style={RESET_ROW_STYLE}>
            <button
              type="button"
              onClick={handleReset}
              disabled={tamperedIndex === null}
              style={resetButtonStyle(tamperedIndex !== null)}
            >
              Reset chain
            </button>
          </div>
        </div>

        {/* aria-live for assistive tech. polite so we don't
            interrupt screen-reader output mid-sentence. */}
        <div
          id={liveRegionId}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          style={SR_ONLY_STYLE}
        >
          {announcement}
        </div>
      </div>
    </section>
  );
}

// ─── Styles ───
// Inline styles so the chain section composes with LandingPage's
// existing CSS-vars without needing a new <style jsx> block.

const SECTION_STYLE: CSSProperties = {
  background: CHAIN_COLORS.ink,
  color: CHAIN_COLORS.cream,
  padding: '120px 48px',
};

const INNER_STYLE: CSSProperties = {
  maxWidth: 1100,
  margin: '0 auto',
};

const HEADER_STYLE: CSSProperties = {
  textAlign: 'center',
  marginBottom: 56,
};

const TAG_STYLE: CSSProperties = {
  fontFamily: "'Barlow', sans-serif",
  fontSize: '0.7rem',
  fontWeight: 500,
  letterSpacing: '0.22em',
  color: CHAIN_COLORS.amber,
  textTransform: 'uppercase',
  marginBottom: 20,
};

const HEADLINE_STYLE: CSSProperties = {
  fontFamily: "'Barlow Condensed', sans-serif",
  fontSize: 'clamp(2rem, 4.2vw, 4rem)',
  fontWeight: 800,
  lineHeight: 1.0,
  letterSpacing: '-0.01em',
  textTransform: 'uppercase',
  margin: '0 0 20px',
};

const CAPTION_STYLE: CSSProperties = {
  fontSize: '1rem',
  lineHeight: 1.6,
  color: CHAIN_COLORS.muted,
  maxWidth: 520,
  margin: '0 auto',
};

const STAGE_STYLE: CSSProperties = {
  width: '100%',
  aspectRatio: '16 / 7',
  minHeight: 280,
  maxHeight: 460,
  background: 'rgba(245,240,232,0.03)',
  borderRadius: 8,
  border: '1px solid rgba(245,240,232,0.08)',
  marginBottom: 36,
  overflow: 'hidden',
  position: 'relative',
};

const CONTROLS_WRAP_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  alignItems: 'center',
};

const CONTROLS_ROW_STYLE: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  gap: 8,
};

const RESET_ROW_STYLE: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
};

function tamperButtonStyle(active: boolean, broken: boolean): CSSProperties {
  return {
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    fontSize: '0.75rem',
    fontWeight: 600,
    letterSpacing: '0.05em',
    padding: '10px 14px',
    border: `1px solid ${active ? CHAIN_COLORS.altered : 'rgba(245,240,232,0.18)'}`,
    background: active ? CHAIN_COLORS.altered : broken ? 'rgba(139,58,58,0.15)' : 'transparent',
    color: active ? CHAIN_COLORS.cream : CHAIN_COLORS.cream,
    cursor: 'pointer',
    borderRadius: 2,
    transition: 'background 120ms ease, border-color 120ms ease',
  };
}

function resetButtonStyle(enabled: boolean): CSSProperties {
  return {
    fontFamily: "'Barlow', sans-serif",
    fontSize: '0.8rem',
    fontWeight: 600,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    padding: '12px 24px',
    border: `1px solid ${CHAIN_COLORS.amber}`,
    background: enabled ? CHAIN_COLORS.amber : 'transparent',
    color: enabled ? CHAIN_COLORS.ink : CHAIN_COLORS.muted,
    cursor: enabled ? 'pointer' : 'not-allowed',
    borderRadius: 2,
    opacity: enabled ? 1 : 0.5,
  };
}

const SR_ONLY_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  border: 0,
};
