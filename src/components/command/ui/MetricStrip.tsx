// FLOSTRUCTION /command — MetricStrip.
// A quiet secondary strip: small numbers, calm labels, tabular figures.
// Never the page hero — that's the trust banner. This is the supporting
// "this week" line that recedes once the eye lands on the headline.

import type { ReactNode } from 'react';

interface Metric {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
}

interface Props {
  metrics: Metric[];
}

export function MetricStrip({ metrics }: Props) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${metrics.length}, minmax(0, 1fr))`,
        gap: 'var(--s-4)',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        padding: 'var(--s-4) var(--s-5)',
      }}
    >
      {metrics.map((m, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            paddingRight: i < metrics.length - 1 ? 'var(--s-4)' : 0,
            borderRight: i < metrics.length - 1 ? '1px solid var(--border)' : 'none',
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
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--t-xl)',
              fontWeight: 500,
              color: 'var(--ink)',
              lineHeight: 1.1,
              letterSpacing: '-0.01em',
              fontVariantNumeric: 'tabular-nums lining-nums',
            }}
          >
            {m.value}
          </div>
          {m.hint ? (
            <div style={{ color: 'var(--ink-muted)', fontSize: 'var(--t-xs)' }}>{m.hint}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
