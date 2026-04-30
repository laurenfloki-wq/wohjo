// WLES Foundation content pages — shared layout
//
// Wraps WLES-Foundation HTML content (rendered via dangerouslySetInnerHTML
// from src/content/wles/*.html) with:
//   - flosmosis.com aesthetic chrome (no new brand surface introduced)
//   - Footer with standards@flosmosis.com + link back to flosmosis.com home
//
// Static styles are loaded from /public/wles-styles.css (mirrors wles.io
// canonical styling). Brand-token alignment is via charcoal/cream/forest/
// amber colour selections inline.
//
// Per WLES Foundation Constitution v1.0 (effective 27 April 2026, governed
// by ACT law per clause 11), FLOSMOSIS PTY LTD (ACN 697 323 925) is the
// Foundation Entity for the WLES. Documents publish at flosmosis.com
// because that is where the Foundation Entity publishes them. No
// formation-phase banner is required.

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

      {/* No formation-phase banner. FLOSMOSIS PTY LTD is the Foundation
          Entity directly, per WLES Foundation Constitution v1.0 (effective
          27 April 2026), governed by ACT law. Documents are at flosmosis.com
          because that is where the Foundation Entity publishes them. */}

      <div className="container">
        <header className="site">
          <div className="wordmark">
            <a href="/wles">WLES — Workforce Ledger Evidentiary Standard</a>
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
            <strong>WLES Foundation</strong> · FLOSMOSIS PTY LTD (ACN 697 323
            925) · Foundation Entity · Australian Capital Territory
          </div>
          <div>
            Contact:{' '}
            <a href="mailto:standards@flosmosis.com" style={{ color: '#2D5F3F' }}>
              standards@flosmosis.com
            </a>
          </div>
          <div>
            Published at flosmosis.com per WLES Foundation Constitution v1.0
            (effective 27 April 2026, cl 7.3 open standard). Return to{' '}
            <a href="/" style={{ color: '#2D5F3F' }}>flosmosis.com home →</a>
          </div>
        </footer>
      </div>
    </>
  );
};

export default WlesLayout;
