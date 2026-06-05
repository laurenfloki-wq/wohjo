// FLOSTRUCTION /command — SpecimenCard.
// A composed "single-row specimen" panel used by Workers, Sites and
// Supervisors when there's exactly one record to render. Anchors the
// page so the real sparse data reads as deliberate, not as a lonely
// row floating in an empty table.
//
// The shape is intentional: title + optional badge on the right,
// followed by a ruled key:value grid. Use the existing DataTable for
// 2+ rows; switch to this for exactly 1.

import type { CSSProperties, ReactNode } from 'react';

export interface SpecimenField {
  label: ReactNode;
  value: ReactNode;
  /** Mono numerals/IDs. */
  mono?: boolean;
  /** Span both columns of the grid. */
  span?: boolean;
}

interface Props {
  /** Quiet uppercase eyebrow above the title. */
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned badge — usually a StatusChip. */
  badge?: ReactNode;
  fields: SpecimenField[];
  /** Optional below-grid slot (e.g. footer note). */
  footer?: ReactNode;
  style?: CSSProperties;
}

export function SpecimenCard({
  eyebrow, title, subtitle, badge, fields, footer, style,
}: Props) {
  return (
    <section
      className="flos-card"
      data-emphasis="primary"
      style={{
        padding: 'var(--card-padding)',
        ...style,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--s-4)',
          marginBottom: 'var(--s-4)',
          paddingBottom: 'var(--s-3)',
          borderBottom: '1px solid var(--rule)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          {eyebrow ? (
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--ink-muted)',
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              {eyebrow}
            </div>
          ) : null}
          <h2
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--t-lg)',
              fontWeight: 600,
              color: 'var(--ink)',
              letterSpacing: '-0.005em',
              margin: 0,
            }}
          >
            {title}
          </h2>
          {subtitle ? (
            <div style={{ marginTop: 4, color: 'var(--ink-secondary)', fontSize: 'var(--t-sm)' }}>
              {subtitle}
            </div>
          ) : null}
        </div>
        {badge ? <div style={{ flexShrink: 0 }}>{badge}</div> : null}
      </header>

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(160px, max-content) 1fr',
          rowGap: 'var(--s-3)',
          columnGap: 'var(--s-4)',
          margin: 0,
          fontSize: 'var(--t-sm)',
        }}
      >
        {fields.map((f, i) => (
          <DefRow key={i} field={f} />
        ))}
      </dl>

      {footer ? (
        <div
          style={{
            marginTop: 'var(--s-4)',
            paddingTop: 'var(--s-3)',
            borderTop: '1px solid var(--rule)',
            color: 'var(--ink-muted)',
            fontSize: 'var(--t-xs)',
            lineHeight: 1.55,
          }}
        >
          {footer}
        </div>
      ) : null}
    </section>
  );
}

function DefRow({ field }: { field: SpecimenField }) {
  return (
    <>
      <dt
        style={{
          color: 'var(--ink-muted)',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontWeight: 500,
          gridColumn: field.span ? '1 / -1' : undefined,
          alignSelf: 'baseline',
        }}
      >
        {field.label}
      </dt>
      <dd
        style={{
          margin: 0,
          color: 'var(--ink)',
          fontFamily: field.mono ? 'var(--font-mono)' : 'inherit',
          fontVariantNumeric: 'tabular-nums lining-nums',
          gridColumn: field.span ? '1 / -1' : undefined,
        }}
      >
        {field.value}
      </dd>
    </>
  );
}
