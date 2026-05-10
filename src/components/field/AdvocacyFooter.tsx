/**
 * AdvocacyFooter — Server Component
 * Persistent navigation footer for /field/* pages.
 * Links to the three public worker advocacy pages.
 * Minimum touch target: 44px per link.
 */

import type { ReactNode } from 'react';

const FOOTER_STYLE: React.CSSProperties = {
  background: '#F5F2EA',
  borderTop: '1px solid #D9D5CB',
  padding: '12px 20px',
  display: 'flex',
  flexDirection: 'row',
  gap: '4px',
  justifyContent: 'center',
  alignItems: 'center',
  flexWrap: 'wrap',
  fontFamily: 'var(--font-inter, "IBM Plex Sans", system-ui, sans-serif)',
  fontSize: '13px',
  color: '#0E1C2F',
};

const LINK_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '44px',
  padding: '0 12px',
  color: '#0E1C2F',
  textDecoration: 'underline',
  fontWeight: 500,
  textDecorationColor: 'rgba(14,28,47,0.4)',
};

const SEP_STYLE: React.CSSProperties = {
  color: 'rgba(14,28,47,0.3)',
  fontSize: '12px',
  userSelect: 'none',
  padding: '0 2px',
};

export default function AdvocacyFooter(): ReactNode {
  return (
    <footer style={FOOTER_STYLE} aria-label="Worker information">
      <a href="/field/faq" style={LINK_STYLE}>
        FAQ
      </a>
      <span style={SEP_STYLE} aria-hidden="true">
        ·
      </span>
      <a href="/field/seal" style={LINK_STYLE}>
        How records are sealed
      </a>
      <span style={SEP_STYLE} aria-hidden="true">
        ·
      </span>
      <a href="/field/rights" style={LINK_STYLE}>
        Your rights
      </a>
    </footer>
  );
}
