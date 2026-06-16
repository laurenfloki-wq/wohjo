// FLOSTRUCTION /command — MetricStrip.
// A quiet secondary strip: small numbers, calm labels, tabular figures.
// Never the page hero — that's the trust banner. This is the supporting
// "this week" line that recedes once the eye lands on the headline.

import type { ReactNode } from 'react';

export interface MetricDelta {
  /** up = favourable growth, down = decline, flat = unchanged. */
  dir: 'up' | 'down' | 'flat';
  /** Human comparator, e.g. "+8% vs same point last week" or "— first period". */
  label: string;
}

interface Metric {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  /** Period-over-period comparator. Takes precedence over `hint`. */
  delta?: MetricDelta;
}

// Calm, non-theatrical tone map: growth reads in the verified green; decline
// and flat stay quiet ink-muted (direction-of-good varies per metric, so we
// signal direction with a caret, not alarm with red).
const DELTA_TONE: Record<MetricDelta['dir'], string> = {
  up: 'var(--verified)',
  down: 'var(--ink-muted)',
  flat: 'var(--ink-muted)',
};
const DELTA_CARET: Record<MetricDelta['dir'], string> = { up: '↑', down: '↓', flat: '→' };

interface Props {
  metrics: Metric[];
}

export function MetricStrip({ metrics }: Props) {
  return (
    <div
      className="flos-ledger-band"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${metrics.length}, minmax(0, 1fr))`,
        gap: 0,
        padding: 0,
      }}
    >
      {metrics.map((m, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: 'var(--s-5) var(--s-5)',
            // Engraved vertical hairline between cells — two-tone
            // (paper inset + ink rule) so it reads as a ruled ledger.
            borderRight: i < metrics.length - 1 ? '1px solid var(--border-strong)' : 'none',
            boxShadow: i < metrics.length - 1 ? '1px 0 0 0 var(--border-emboss)' : undefined,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--ink-muted)',
              fontWeight: 500,
            }}
          >
            {m.label}
          </div>
          <div
            style={{
              // Data numerals are ALWAYS Inter tabular — the same digits
              // here as in any table cell or inline number. Display serif
              // is reserved for the one hero number per page.
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--t-xl)',
              fontWeight: 500,
              color: 'var(--ink)',
              lineHeight: 1.1,
              letterSpacing: '-0.012em',
              fontVariantNumeric: 'tabular-nums lining-nums',
              fontFeatureSettings: '"tnum" 1, "lnum" 1',
            }}
          >
            {m.value}
          </div>
          {m.delta ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 'var(--t-xs)',
                color: DELTA_TONE[m.delta.dir],
                fontVariantNumeric: 'tabular-nums lining-nums',
              }}
            >
              <span aria-hidden="true">{DELTA_CARET[m.delta.dir]}</span>
              <span>{m.delta.label}</span>
            </div>
          ) : m.hint ? (
            <div style={{ color: 'var(--ink-muted)', fontSize: 'var(--t-xs)' }}>{m.hint}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
