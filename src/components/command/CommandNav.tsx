'use client';

// FLOSTRUCTION /command — flat, calm top nav.
// One canonical wordmark. Six tabs only. Active tab is a calm accent
// underline (never the heavy green bar). No "Intelligence" tab — its
// trend content folds into Overview. "Super Evidence" is now "Evidence".

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS: { href: string; label: string; match?: (path: string) => boolean }[] = [
  { href: '/command/dashboard', label: 'Overview', match: (p) => p === '/command/dashboard' || p === '/command' },
  { href: '/command/approvals', label: 'Approvals' },
  { href: '/command/workers',   label: 'Workers',  match: (p) => p.startsWith('/command/workers') },
  { href: '/command/sites',     label: 'Sites' },
  { href: '/command/supervisors', label: 'Supervisors' },
  { href: '/command/evidence',  label: 'Evidence', match: (p) => p.startsWith('/command/evidence') || p.startsWith('/command/super-evidence') },
];

export default function CommandNav() {
  const pathname = usePathname() ?? '';

  return (
    <nav
      aria-label="Primary"
      style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '0 var(--page-gutter)',
        display: 'flex',
        alignItems: 'stretch',
        gap: 0,
        height: 56,
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}
    >
      <Link
        href="/command/dashboard"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          color: 'var(--ink)',
          textDecoration: 'none',
          marginRight: 36,
          minHeight: 'auto',
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 'var(--t-md)',
          letterSpacing: '-0.01em',
        }}
      >
        <FMarkGlyph />
        <span>FLOSTRUCTION</span>
      </Link>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, flex: 1, overflowX: 'auto' }}>
        {NAV_ITEMS.map((item) => {
          const active = item.match ? item.match(pathname) : pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              style={{
                padding: '0 14px',
                height: 56,
                display: 'inline-flex',
                alignItems: 'center',
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--t-sm)',
                fontWeight: active ? 600 : 500,
                color: active ? 'var(--ink)' : 'var(--ink-secondary)',
                textDecoration: 'none',
                letterSpacing: '0.005em',
                borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease)',
                minHeight: 'auto',
                whiteSpace: 'nowrap',
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * F-mark glyph — minimal, monoline. Kept inline so the nav doesn't pull
 * in the legacy on-navy / cream FMark variants that don't suit the
 * light institutional surface.
 */
function FMarkGlyph() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      role="img"
      aria-label="F-mark"
      style={{ display: 'block' }}
    >
      <rect x="4" y="3" width="16" height="2.25" rx="0.5" fill="var(--ink)" />
      <rect x="4" y="3" width="2.25" height="18" rx="0.5" fill="var(--ink)" />
      <rect x="4" y="10.75" width="11" height="2.25" rx="0.5" fill="var(--ink)" />
      <line x1="8" y1="20" x2="20" y2="14" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
