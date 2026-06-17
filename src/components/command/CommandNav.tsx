'use client';

// FLOSTRUCTION /command — flat, calm top nav.
// One canonical wordmark. Six tabs only. Active tab is a calm accent
// underline (never the heavy green bar). No "Intelligence" tab — its
// trend content folds into Overview. "Super Evidence" is now "Evidence".

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS: { href: string; label: string; match?: (path: string) => boolean }[] = [
  {
    href: '/command/dashboard',
    label: 'Overview',
    match: (p) => p === '/command/dashboard' || p === '/command',
  },
  { href: '/command/approvals', label: 'Approvals' },
  { href: '/command/workers', label: 'Workers', match: (p) => p.startsWith('/command/workers') },
  { href: '/command/sites', label: 'Sites' },
  { href: '/command/supervisors', label: 'Supervisors' },
  {
    href: '/command/evidence',
    label: 'Evidence',
    match: (p) => p.startsWith('/command/evidence') || p.startsWith('/command/super-evidence'),
  },
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
      {/* Wordmark-only lockup. The F glyph experiments did not hold
          up at every nav size; "FLOSTRUCTION" set in Inter with
          opentype small-caps and a tight tracking sits more cleanly
          and reads as a proper wordmark, not a logo + word. */}
      <Link
        href="/command/dashboard"
        style={{
          display: 'inline-flex',
          alignItems: 'baseline',
          color: 'var(--ink)',
          textDecoration: 'none',
          marginRight: 36,
          minHeight: 'auto',
          fontFamily: 'var(--font-sans)',
          fontWeight: 600,
          fontSize: 14,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          fontFeatureSettings: '"cv11" 1, "ss01" 1',
        }}
      >
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
                transition:
                  'color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease)',
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
