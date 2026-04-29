// WLES Foundation content pages — shared layout
//
// Wraps WLES-Foundation HTML content (rendered via dangerouslySetInnerHTML
// from src/content/wles/*.html) with:
//   - Formation-phase header banner (per regulatory submission cross-references)
//   - flosmosis.com aesthetic chrome (no new brand surface introduced)
//   - Footer with standards@flosmosis.com + link back to flosmosis.com home
//
// Static styles are loaded from /public/wles-styles.css (mirrors wles.io
// canonical styling). Brand-token alignment is via charcoal/cream/forest/
// amber colour selections inline.
//
// Reference: WLES Foundation Charter clause 1.2 binds the Founding Member
// (FLOSMOSIS PTY LTD) to incorporate the Foundation as a separate entity
// within 24 months of charter adoption.

import type { FC, ReactNode } from 'react';

export interface WlesLayoutProps {
  /** Page title rendered in the browser tab */
  title: string;
  /** Short description for meta + opengraph */
  description?: string;
  /** Canonical absolute URL (e.g. https://flosmosis.com/wles) */
  canonical?: string;
  /** Currently-active nav item: 'wles' | 'spec' | 'implementers' | 'verifier' | 'foundation' */
  active?: 'wles' | 'spec' | 'implementers' | 'verifier' | 'foundation';
  children: ReactNode;
}

const NAV: Array<{ key: NonNullable<WlesLayoutProps['active']>; label: string; href: string }> = [
  { key: 'wles',         label: 'WLES',          href: '/wles' },
  { key: 'spec',         label: 'Specification', href: '/wles/spec' },
  { key: 'implementers', label: 'Implementers',  href: '/wles/implementers' },
  { key: 'verifier',     label: 'Verifier',      href: '/wles/verifier' },
  { key: 'foundation',   label: 'Foundation',    href: '/wles/foundation' },
];

export const WlesLayout: FC<WlesLayoutProps> = ({ active = 'wles', children }) => {
  return (
    <>
      {/* Static stylesheet from canonical wles.io site, served from public/ */}
      <link rel="stylesheet" href="/wles-styles.css" />

      {/* Formation-phase banner — required reference for all 6 regulatory submissions.
          Visible above-the-fold on every WLES Foundation content page. */}
      <div
        role="region"
        aria-label="WLES Foundation formation-phase status"
        style={{
          background: '#1A1A1C',
          color: '#F5F2EA',
          padding: '10px 20px',
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: 13,
          lineHeight: 1.5,
          textAlign: 'center',
          borderBottom: '1px solid #2D5F3F',
        }}
      >
        <strong style={{ fontWeight: 700, letterSpacing: '0.04em' }}>
          WLES Foundation
        </strong>{' '}
        — In formation, currently co-hosted with FLOSMOSIS PTY LTD pending
        separate-entity incorporation per Constitution clause 1.2.
      </div>

      <div className="container">
        <header className="site">
          <div className="wordmark">
            <a href="/wles">WLES — Workforce Labour Event Standard</a>
          </div>
          <nav>
            {NAV.map((item) => (
              <a
                key={item.key}
                href={item.href}
                className={item.key === active ? 'active' : undefined}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </header>

        <main>{children}</main>

        <footer
          style={{
            marginTop: 64,
            padding: '32px 0',
            borderTop: '1px solid #E2DDD0',
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 13,
            color: '#55555C',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div>
            <strong>WLES Foundation</strong> · in formation · Australian
            Capital Territory
          </div>
          <div>
            Contact:{' '}
            <a href="mailto:standards@flosmosis.com" style={{ color: '#2D5F3F' }}>
              standards@flosmosis.com
            </a>
          </div>
          <div>
            Co-hosted at flosmosis.com pending separate-entity incorporation.
            Return to <a href="/" style={{ color: '#2D5F3F' }}>flosmosis.com home →</a>
          </div>
        </footer>
      </div>
    </>
  );
};

export default WlesLayout;
