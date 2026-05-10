'use client';

/**
 * SealExpandable — Client Component
 * Expandable "What does this mean?" section below the SealedRibbon
 * on the receipt page.
 */

import { useState, useId } from 'react';

const CONTAINER_STYLE: React.CSSProperties = {
  marginTop: '10px',
};

const BUTTON_STYLE: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '8px 0',
  cursor: 'pointer',
  fontSize: '13px',
  color: 'rgba(245,242,234,0.8)',
  textDecoration: 'underline',
  textDecorationColor: 'rgba(245,242,234,0.4)',
  fontFamily: 'inherit',
  display: 'flex',
  minHeight: '44px',
  alignItems: 'center',
} as React.CSSProperties;

const PANEL_STYLE: React.CSSProperties = {
  marginTop: '10px',
  padding: '14px',
  background: 'rgba(245,242,234,0.08)',
  borderRadius: '6px',
  fontSize: '14px',
  lineHeight: 1.55,
  color: 'rgba(245,242,234,0.88)',
};

const LINK_STYLE: React.CSSProperties = {
  display: 'inline-block',
  marginTop: '10px',
  color: 'rgba(245,242,234,0.9)',
  textDecoration: 'underline',
  fontSize: '13px',
  fontWeight: 600,
  minHeight: '44px',
  lineHeight: '44px',
};

const EXCERPT =
  'When you submit a shift, FLOSTRUCTION takes a fingerprint of every detail — ' +
  'start time, end time, breaks, the GPS reading, who you are. That fingerprint ' +
  'becomes part of the permanent record.';

export default function SealExpandable() {
  const [open, setOpen] = useState(false);
  const id = useId();
  const panelId = `seal-panel-${id}`;
  const buttonId = `seal-btn-${id}`;

  return (
    <div role="region" aria-labelledby={buttonId} style={CONTAINER_STYLE}>
      <button
        id={buttonId}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
        style={BUTTON_STYLE}
      >
        What does this mean?{' '}
        <span aria-hidden="true" style={{ marginLeft: '4px' }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div id={panelId} style={PANEL_STYLE}>
          <p style={{ margin: 0 }}>{EXCERPT}</p>
          <a href="/field/seal" style={LINK_STYLE}>
            Read the full explanation →
          </a>
        </div>
      )}
    </div>
  );
}
