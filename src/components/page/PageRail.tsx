'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// The 64px icon rail — five destinations, hover tooltips, chain pulse
// and operator avatar at the foot. The rail's foot and the page footer
// are distinct components by law; they share no class.
const DESTINATIONS = [
  { href: '/today', label: 'Today' },
  { href: '/payruns', label: 'Pay runs' },
  { href: '/people', label: 'People' },
  { href: '/sites', label: 'Sites' },
  { href: '/record', label: 'The record' },
] as const;

function RailIcon({ label }: { label: string }) {
  switch (label) {
    case 'Today':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 3h8l4 4v14H7z" />
          <path d="M15 3v4h4M10 12h6M10 16h6" />
        </svg>
      );
    case 'Pay runs':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <circle cx="12" cy="12" r="2.6" />
        </svg>
      );
    case 'People':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5S13.9 16 14.5 19M15.5 11.2c1.8.3 3.3 1.5 4 3.8" />
          <circle cx="16.5" cy="7" r="2.4" />
        </svg>
      );
    case 'Sites':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" />
          <circle cx="12" cy="10" r="2.6" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5c-2-1.4-4.6-2-7-2v16c2.4 0 5 .6 7 2 2-1.4 4.6-2 7-2V3c-2.4 0-5 .6-7 2z" />
          <path d="M12 5v16" />
        </svg>
      );
  }
}

export default function PageRail() {
  const pathname = usePathname();
  return (
    <nav className="rail" aria-label="Surfaces">
      <div className="mark" aria-hidden="true">
        <svg width="19" height="19" viewBox="0 0 20 20">
          <rect x="2" y="3" width="12" height="2.6" fill="#1F1B14" />
          <rect x="2" y="8.2" width="9.5" height="2.6" fill="#1F1B14" />
          <rect x="2" y="13.4" width="7" height="2.6" fill="#1F1B14" />
          <g stroke="#1E6B3C" strokeWidth="1.7">
            <line x1="12" y1="17.5" x2="17.5" y2="15.7" />
            <line x1="13" y1="14" x2="18.5" y2="12.2" />
            <line x1="14" y1="10.5" x2="19.5" y2="8.7" />
          </g>
        </svg>
      </div>
      {DESTINATIONS.map((d) => (
        <Link
          key={d.href}
          href={d.href}
          className={pathname?.startsWith(d.href) === true ? 'cur' : ''}
          aria-label={d.label}
          aria-current={pathname?.startsWith(d.href) === true ? 'page' : undefined}
        >
          <RailIcon label={d.label} />
          <span className="tip">{d.label}</span>
        </Link>
      ))}
      <div className="railfoot">
        <span className="chain" title="Chain verified" />
        <div className="avatar" aria-hidden="true">
          LD
        </div>
      </div>
    </nav>
  );
}
