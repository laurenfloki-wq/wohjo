'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

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
    <nav style={{
      background: 'var(--color-navy)',
      padding: '0 24px',
      display: 'flex',
      alignItems: 'center',
      gap: '0',
      height: '56px',
    }}>
      <Link href="/command/dashboard" style={{
        fontFamily: 'var(--font-mono)',
        fontWeight: 700,
        fontSize: '15px',
        color: '#fff',
        textDecoration: 'none',
        marginRight: '32px',
        letterSpacing: '-0.3px',
      }}>
        Flostruction
      </Link>
      {NAV_ITEMS.map(item => (
        <Link
          key={item.href}
          href={item.href}
          style={{
            padding: '0 14px',
            height: '56px',
            display: 'flex',
            alignItems: 'center',
            fontSize: '14px',
            fontWeight: 600,
            color: pathname === item.href ? '#fff' : 'rgba(255,255,255,0.55)',
            textDecoration: 'none',
            borderBottom: pathname === item.href ? '2px solid var(--color-green)' : '2px solid transparent',
            transition: 'color 0.15s',
          }}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
