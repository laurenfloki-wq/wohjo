// FLOSTRUCTION /command — PageHeader.
// One canonical page header for every /command page. The eyebrow above
// the title is OPTIONAL and used sparingly — never the literal label
// "COMMAND".
//
// Trailing actions are vertically centred to the title block (not its
// top edge and not its bottom edge), with a fixed inter-button gap.
// Buttons supplied via the `trailing` slot inherit a flex row so a
// pair of <Button /> primitives lines up on one baseline without
// per-page wrappers.

import type { ReactNode } from 'react';

interface Props {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  trailing?: ReactNode;
}

export function PageHeader({ title, description, eyebrow, trailing }: Props) {
  return (
    <header
      style={{
        display: 'flex',
        // Centre the actions vertically to the title BLOCK (eyebrow +
        // title + description), so the buttons sit on the title's
        // optical centre regardless of how many lines the title block
        // takes. flex-end aligns to the bottom edge, which was the
        // misalignment the director flagged on Workers etc.
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--s-5)',
        margin: '0 0 var(--s-6) 0',
        paddingBottom: 'var(--s-5)',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        {eyebrow ? (
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              color: 'var(--ink-muted)',
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            {eyebrow}
          </div>
        ) : null}
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--t-2xl)',
            fontWeight: 600,
            letterSpacing: '-0.015em',
            lineHeight: 1.1,
            color: 'var(--ink)',
            margin: 0,
          }}
        >
          {title}
        </h1>
        {description ? (
          <p
            style={{
              marginTop: 12,
              color: 'var(--ink-secondary)',
              fontSize: 'var(--t-md)',
              maxWidth: 640,
            }}
          >
            {description}
          </p>
        ) : null}
      </div>
      {trailing ? (
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s-2)', /* 8px — the canonical inter-button gap */
          }}
        >
          {trailing}
        </div>
      ) : null}
    </header>
  );
}
