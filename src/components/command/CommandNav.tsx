'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FMark } from '@/components/brand/FMark';

/**
 * /command top navigation — canonical mockup language repaint
 * 2026-04-30 evening. Charcoal-dominant per supporting-screens.html.
 * Active tab indicator: forest underline (sealed/confirmed semantic).
 * Wordmark: Archivo Narrow display + F-mark glyph (canonical brand
 * lockup, on-navy variant — F is white, flow rails are forest-bright).
 */

const NAV_ITEMS = [
  { href: '/command/dashboard', label: 'Dashboard' },
  { href: '/command/approvals', label: 'Approvals' },
  { href: '/command/workers', label: 'Workers' },
  { href: '/command/sites', label: 'Sites' },
  { href: '/command/supervisors', label: 'Supervisors' },
  { href: '/command/intelligence-log', label: 'Intelligence' },
  { href: '/command/super-evidence', label: 'Super Evidence' },
];

export default function CommandNav() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        background: 'var(--color-bg)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        height: 60,
        borderBottom: '1px solid var(--color-border)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      <Link
        href="/command/dashboard"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 12,
          color: 'var(--color-text-primary)',
          textDecoration: 'none',
          marginRight: 36,
          minHeight: 'auto',
        }}
      >
        <FMark size={22} colour="on-navy" rails="primary-only" label="Flostruction" />
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 16,
            letterSpacing: '0.02em',
          }}
        >
          Flostruction
        </span>
      </Link>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, flex: 1 }}>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                padding: '0 14px',
                height: 60,
                display: 'inline-flex',
                alignItems: 'center',
                fontFamily: 'var(--font-sans)',
                fontSize: 13.5,
                fontWeight: active ? 600 : 500,
                color: active
                  ? 'var(--color-text-primary)'
                  : 'var(--color-text-secondary)',
                textDecoration: 'none',
                letterSpacing: '0.01em',
                borderBottom: active
                  ? '2px solid var(--color-green)'
                  : '2px solid transparent',
                transition: 'color 0.15s, border-color 0.15s',
                minHeight: 'auto',
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
