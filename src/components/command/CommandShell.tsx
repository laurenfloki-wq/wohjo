'use client';

// FLOSTRUCTION /command — operator shell (16 Jun 2026 repaint).
//
// Replaces the top Masthead with a cream margin sidebar + a slim,
// always-visible integrity topbar. The sidebar is labelled and groups
// the six canonical destinations; it collapses to a 72px icon rail and
// goes off-canvas on mobile. The topbar carries the live WLES chain
// readout (re-checks /api/command/substrate-health on mount + every
// 60s) so the trust instrument is present on every page, not just the
// dashboard. The canonical nav contract is still pinned in
// CommandNav.tsx (visual-regression.test.ts); this is the live shell.

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import {
  LayoutDashboard,
  ClipboardCheck,
  FileText,
  Users,
  MapPin,
  UserCheck,
  Settings,
  Search,
  ChevronsLeft,
  ChevronsUpDown,
  Menu,
  X,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  Activity,
} from 'lucide-react';
import { relativeTime, formatInt } from '@/lib/format';

interface Health {
  status: 'intact' | 'review' | 'flagged' | 'unknown';
  sealed_count: number;
  last_verified_at: string | null;
  last_cron_verified_at?: string | null;
  broken_links: number;
  message?: string;
}

type IconType = ComponentType<{ size?: number; strokeWidth?: number }>;

interface NavItem {
  href: string;
  label: string;
  Icon: IconType;
  match?: (path: string) => boolean;
}

// Two groups over the six canonical destinations: the daily workflow
// (Operate) and the entities you manage (Directory). Hrefs and order
// stay canonical — the pinned set lives in CommandNav.tsx.
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Operate',
    items: [
      {
        href: '/command/dashboard',
        label: 'Overview',
        Icon: LayoutDashboard,
        match: (p) => p === '/command/dashboard' || p === '/command',
      },
      { href: '/command/approvals', label: 'Approvals', Icon: ClipboardCheck },
      {
        href: '/command/evidence',
        label: 'Evidence',
        Icon: FileText,
        match: (p) => p.startsWith('/command/evidence') || p.startsWith('/command/super-evidence'),
      },
    ],
  },
  {
    label: 'Directory',
    items: [
      {
        href: '/command/workers',
        label: 'Workers',
        Icon: Users,
        match: (p) => p.startsWith('/command/workers'),
      },
      { href: '/command/sites', label: 'Sites', Icon: MapPin },
      { href: '/command/supervisors', label: 'Supervisors', Icon: UserCheck },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);
const HEALTH_ENDPOINT = '/api/command/substrate-health';

export default function CommandShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Close the mobile drawer on navigation.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Live chain readout — initial load + 60s poll.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(HEALTH_ENDPOINT, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = (await res.json()) as Health;
        if (!cancelled) setHealth(j);
      } catch {
        if (!cancelled) {
          setHealth({
            status: 'unknown',
            sealed_count: 0,
            last_verified_at: null,
            broken_links: 0,
          });
        }
      }
    }
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  // ⌘K / Ctrl-K focuses the jump field; Escape closes the mobile drawer.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCollapsed(false);
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') setMobileOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim().toLowerCase();
    if (!q) return;
    const hit = ALL_ITEMS.find((i) => i.label.toLowerCase().includes(q));
    if (hit) {
      router.push(hit.href);
      setQuery('');
      searchRef.current?.blur();
    }
  }

  const status = health?.status ?? 'unknown';
  const StatusIcon =
    status === 'flagged'
      ? AlertTriangle
      : status === 'review'
        ? AlertCircle
        : status === 'intact'
          ? ShieldCheck
          : Activity;

  const integrityText = (() => {
    if (status === 'intact') {
      const ago = health?.last_verified_at ? relativeTime(health.last_verified_at) : 're-checking';
      return `Ledger sealed · chain intact · ${formatInt(health?.sealed_count ?? 0)} events · verified ${ago}`;
    }
    if (status === 'review') return health?.message ?? 'Ledger sealed · recent checks need review';
    if (status === 'flagged') {
      return (
        health?.message ??
        `Ledger integrity flagged · ${formatInt(health?.broken_links ?? 0)} broken links`
      );
    }
    return 'Re-checking integrity…';
  })();

  return (
    <div className="flos-shell" data-collapsed={collapsed} data-mobile-open={mobileOpen}>
      <aside className="flos-sidebar" aria-label="Primary navigation">
        <div className="flos-sb-head">
          <Link
            href="/command/dashboard"
            aria-label="FLOSTRUCTION home"
            style={{ display: 'inline-flex' }}
          >
            <FMark />
          </Link>
          <span className="flos-sb-word">FLOSTRUCTION</span>
          <button
            type="button"
            className="flos-sb-collapse"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-pressed={collapsed}
            onClick={() => setCollapsed((c) => !c)}
          >
            <ChevronsLeft
              size={16}
              strokeWidth={1.8}
              style={{
                transform: collapsed ? 'rotate(180deg)' : 'none',
                transition: 'transform var(--dur) var(--ease)',
              }}
            />
          </button>
        </div>

        <form className="flos-sb-search" onSubmit={onSearchSubmit} role="search">
          <Search size={15} strokeWidth={1.8} aria-hidden />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search or jump to…"
            aria-label="Search or jump to"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd>⌘K</kbd>
        </form>

        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="flos-sb-group">{group.label}</div>
            <nav className="flos-sb-nav" aria-label={group.label}>
              {group.items.map((item) => {
                const active = item.match ? item.match(pathname) : pathname === item.href;
                const { Icon } = item;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={active ? 'active' : undefined}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon size={19} strokeWidth={1.7} />
                    <span className="flos-sb-lbl">{item.label}</span>
                    <span className="flos-sb-tip">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}

        <div className="flos-sb-foot">
          <Link href="/command/security/mfa" className="flos-sb-row">
            <Settings size={19} strokeWidth={1.7} />
            <span className="flos-sb-lbl">Settings</span>
            <span className="flos-sb-tip">Settings</span>
          </Link>
          <div
            className="flos-sb-row flos-tenant"
            role="button"
            tabIndex={0}
            aria-label="Active tenant"
          >
            <span className="flos-tenant-chip">DL</span>
            <span className="flos-tenant-meta">
              <span className="n">Demo Labour Hire</span>
              <span className="s">director</span>
            </span>
            <ChevronsUpDown className="flos-tenant-ch" size={16} strokeWidth={1.7} />
            <span className="flos-sb-tip">Demo Labour Hire</span>
          </div>
        </div>
      </aside>

      <button
        type="button"
        className="flos-scrim"
        aria-label="Close navigation"
        tabIndex={mobileOpen ? 0 : -1}
        onClick={() => setMobileOpen(false)}
      />

      <div className="flos-main">
        <div className="flos-topbar">
          <button
            type="button"
            className="flos-burger"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            {mobileOpen ? <X size={20} strokeWidth={1.8} /> : <Menu size={20} strokeWidth={1.8} />}
          </button>
          <div className="flos-integrity" data-status={status} role="status" aria-live="polite">
            <span className="flos-int-dot" aria-hidden />
            <StatusIcon size={12} strokeWidth={2} aria-hidden />
            <span>{integrityText}</span>
          </div>
        </div>

        <main id="main" style={{ flex: 1 }}>
          <div
            className="flos-content"
            style={{ padding: 'var(--s-6) var(--page-gutter) var(--s-7)' }}
          >
            {children}
          </div>
        </main>

        <footer
          style={{
            textAlign: 'center',
            padding: 'var(--s-5) var(--page-gutter)',
            fontSize: 'var(--t-xs)',
            color: 'var(--ink-muted)',
            lineHeight: 1.55,
            borderTop: '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          FLOSTRUCTION verifies hours and records shift events. Downstream calculations are
          performed by your existing payroll provider.
        </footer>
      </div>
    </div>
  );
}

// The mark — the canonical FLOSTRUCTION Brand Suite v3 mark: three cream
// bars crossed by three forest diagonals at 18°. Geometry is the
// marketing source of truth (src/components/marketing/devices/FMarkBars.tsx,
// flostruction-v5.html:499), inset onto the navy tile so the cream bars
// read on the cream sidebar.
function FMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 96 96" fill="none" aria-hidden>
      <rect width="96" height="96" rx="24" fill="var(--accent)" />
      <g transform="translate(48 48) scale(0.82) translate(-48 -48)">
        <rect x="6" y="23" width="84" height="10" fill="#F5F3EE" />
        <rect x="6" y="43" width="84" height="10" fill="#F5F3EE" />
        <rect x="6" y="63" width="84" height="10" fill="#F5F3EE" />
        <g transform="rotate(18 48 48)">
          <rect x="30.5" y="5" width="7" height="86" fill="#1E7A40" />
          <rect x="44.5" y="5" width="7" height="86" fill="#1E7A40" />
          <rect x="58.5" y="5" width="7" height="86" fill="#1E7A40" />
        </g>
      </g>
    </svg>
  );
}
