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
        // Stack the eyebrow (if any), the title-row, and the
        // description (if any) vertically. The actions cluster sits
        // on the title-row ONLY — not in line with the description —
        // so their vertical centre lines up with the h1's optical
        // centre, not with a centre dragged down by the description.
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        margin: '0 0 var(--s-6) 0',
        paddingBottom: 'var(--s-5)',
        borderBottom: '1px solid var(--rule)',
      }}
    >
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--s-5)',
          minHeight: 44, /* match Button md height for cluster alignment */
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--t-2xl)',
            fontWeight: 600,
            letterSpacing: '-0.015em',
            lineHeight: 1.1,
            color: 'var(--ink)',
            margin: 0,
            minWidth: 0,
            flex: 1,
          }}
        >
          {title}
        </h1>
        {trailing ? (
          <div
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--s-2)', /* canonical inter-button gap */
            }}
          >
            {trailing}
          </div>
        ) : null}
      </div>
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
    </header>
  );
}
