'use client';

// FLOSTRUCTION /command — TrustBar.
// Top-of-shell, always visible, quiet. Mo's heartbeat: "Records sealed ·
// chain intact · verified <relative time>". Reads live state from
// /api/command/substrate-health (created by this PR). Degrades honestly:
// if state is unknown, says "checking…"; if anything is wrong, the bar
// switches to a calm but visible review/flagged treatment.
//
// No fabricated status — the API is the source of truth.

import { useEffect, useState } from 'react';
import { ShieldCheck, AlertTriangle, AlertCircle } from 'lucide-react';
import { relativeTime, formatInt } from '@/lib/format';

interface Health {
  status: 'intact' | 'review' | 'flagged' | 'unknown';
  sealed_count: number;
  last_verified_at: string | null;
  broken_links: number;
  message?: string;
}

const ENDPOINT = '/api/command/substrate-health';

export function TrustBar() {
  const [data, setData] = useState<Health | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(ENDPOINT, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = (await res.json()) as Health;
        if (!cancelled) setData(j);
      } catch {
        if (!cancelled) setData({ status: 'unknown', sealed_count: 0, last_verified_at: null, broken_links: 0 });
      }
    }
    void load();
    const interval = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (tick > 0) {
      void fetch(ENDPOINT, { cache: 'no-store' })
        .then((r) => r.json())
        .then((j: Health) => setData(j))
        .catch(() => {});
    }
  }, [tick]);

  const status = data?.status ?? 'unknown';
  const palette = (() => {
    switch (status) {
      case 'intact':   return { fg: 'var(--verified)', bg: 'var(--verified-bg)', bd: 'var(--verified-border)' };
      case 'review':   return { fg: 'var(--review)',   bg: 'var(--review-bg)',   bd: 'var(--review-border)' };
      case 'flagged':  return { fg: 'var(--flagged)',  bg: 'var(--flagged-bg)',  bd: 'var(--flagged-border)' };
      default:         return { fg: 'var(--ink-secondary)', bg: 'var(--surface-sunken)', bd: 'var(--border)' };
    }
  })();

  const Icon = status === 'intact' ? ShieldCheck
             : status === 'review' ? AlertCircle
             : status === 'flagged' ? AlertTriangle
             : ShieldCheck;

  let copy: string;
  if (status === 'intact') {
    const verifiedAgo = data?.last_verified_at ? relativeTime(data.last_verified_at) : 'verifying…';
    copy = `Records sealed · chain intact · ${formatInt(data?.sealed_count ?? 0)} verified · last check ${verifiedAgo}`;
  } else if (status === 'review') {
    copy = data?.message ?? 'Records are sealed; recent checks need a review.';
  } else if (status === 'flagged') {
    copy = data?.message ?? `Chain integrity needs attention (${formatInt(data?.broken_links ?? 0)} broken links).`;
  } else {
    copy = 'Checking integrity…';
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 16px',
        background: palette.bg,
        color: palette.fg,
        borderBottom: `1px solid ${palette.bd}`,
        fontSize: 'var(--t-sm)',
        fontWeight: 500,
        letterSpacing: '0.005em',
        fontVariantNumeric: 'tabular-nums lining-nums',
      }}
    >
      <Icon size={14} strokeWidth={1.7} aria-hidden />
      <span>{copy}</span>
    </div>
  );
}
