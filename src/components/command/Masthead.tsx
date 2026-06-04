'use client';

// FLOSTRUCTION /command — Masthead.
// Single unified header used identically on every /command page. The
// wordmark, nav, and content all share one left edge via the
// `.flos-content` class (max-width: var(--page-max); centred; same
// var(--page-gutter) inset). The trust readout is bonded inside the
// masthead as an engraved monospace instrument readout — not a
// disconnected floating band.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ShieldCheck, AlertCircle, AlertTriangle, Activity } from 'lucide-react';
import { relativeTime, formatInt } from '@/lib/format';

interface Health {
  status: 'intact' | 'review' | 'flagged' | 'unknown';
  sealed_count: number;
  last_verified_at: string | null;
  last_cron_verified_at?: string | null;
  broken_links: number;
  message?: string;
}

const NAV_ITEMS: { href: string; label: string; match?: (path: string) => boolean }[] = [
  { href: '/command/dashboard', label: 'Overview', match: (p) => p === '/command/dashboard' || p === '/command' },
  { href: '/command/approvals', label: 'Approvals' },
  { href: '/command/workers',   label: 'Workers',  match: (p) => p.startsWith('/command/workers') },
  { href: '/command/sites',     label: 'Sites' },
  { href: '/command/supervisors', label: 'Supervisors' },
  { href: '/command/evidence',  label: 'Evidence', match: (p) => p.startsWith('/command/evidence') || p.startsWith('/command/super-evidence') },
];

const HEALTH_ENDPOINT = '/api/command/substrate-health';

export default function Masthead() {
  const pathname = usePathname() ?? '';
  const [health, setHealth] = useState<Health | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(HEALTH_ENDPOINT, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = (await res.json()) as Health;
        if (!cancelled) setHealth(j);
      } catch {
        if (!cancelled) setHealth({ status: 'unknown', sealed_count: 0, last_verified_at: null, broken_links: 0 });
      }
    }
    void load();
    const interval = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (tick > 0) {
      void fetch(HEALTH_ENDPOINT, { cache: 'no-store' })
        .then((r) => r.json())
        .then((j: Health) => setHealth(j))
        .catch(() => {});
    }
  }, [tick]);

  const status = health?.status ?? 'unknown';
  const Icon = status === 'flagged' ? AlertTriangle
             : status === 'review'  ? AlertCircle
             : status === 'intact'  ? ShieldCheck
             : Activity;

  const readoutText = (() => {
    if (status === 'intact') {
      const verifiedAgo = health?.last_verified_at ? relativeTime(health.last_verified_at) : 're-checking';
      return `Ledger sealed · chain intact · ${formatInt(health?.sealed_count ?? 0)} events · verified ${verifiedAgo}`;
    }
    if (status === 'review') {
      return health?.message ?? 'Ledger sealed · recent checks need review';
    }
    if (status === 'flagged') {
      return health?.message ?? `Ledger integrity flagged · ${formatInt(health?.broken_links ?? 0)} broken links`;
    }
    return 'Re-checking integrity…';
  })();

  return (
    <header className="flos-masthead" role="banner">
      <div className="flos-content">
        <div className="flos-masthead-row">
          {/* Wordmark — left edge aligns to content gutter. */}
          <Link
            href="/command/dashboard"
            style={{
              display: 'inline-flex',
              alignItems: 'baseline',
              color: 'var(--ink)',
              textDecoration: 'none',
              fontFamily: 'var(--font-sans)',
              fontWeight: 600,
              fontSize: 14,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              minHeight: 'auto',
              whiteSpace: 'nowrap',
              alignSelf: 'center',
            }}
          >
            FLOSTRUCTION
          </Link>

          {/* Nav — middle column, fluid. */}
          <nav aria-label="Primary" className="flos-masthead-nav">
            {NAV_ITEMS.map((item) => {
              const active = item.match ? item.match(pathname) : pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  style={{
                    padding: '0 14px',
                    height: 'var(--masthead-height)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 'var(--t-sm)',
                    fontWeight: active ? 600 : 500,
                    color: active ? 'var(--ink)' : 'var(--ink-secondary)',
                    textDecoration: 'none',
                    letterSpacing: '0.005em',
                    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                    marginBottom: -1, /* sit on top of the masthead's bottom rule */
                    transition: 'color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease)',
                    minHeight: 'auto',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Bonded readout — engraved instrument. */}
          <div
            className="flos-readout flos-masthead-readout"
            data-status={status}
            role="status"
            aria-live="polite"
          >
            <Icon size={12} strokeWidth={2} aria-hidden />
            <span>{readoutText}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
