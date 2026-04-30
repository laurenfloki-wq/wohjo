'use client';

// Flostruction Field — Records (history) page
// /field/records
//
// The worker's permanent labour record. Lists every shift they've
// worked through FLOSTRUCTION, most recent first, with date / site /
// hours / status. Tap any entry to open its receipt at
// /field/receipt/<receipt_id>.
//
// Records-substrate framing: the worker is the keeper of the record,
// not the subject of a system. Per worker FAQ "Tap 'My records' in
// the app. You'll see every shift you've ever worked through
// FLOSTRUCTION." (src/content/worker/faq.md:133-142). Built
// 2026-04-30 evening per labour-hire-workflow-gap-analysis-2026-04-29
// §G11 (newly surfaced gap; FAQ promise unmet pre-fix).

import { useEffect, useState, useCallback, type FC } from 'react';
import { palette, radius, typography } from '@/lib/field/tokens';
import { formatDateLong, formatDecimalHours } from '@/lib/field/format';

interface RecordsShift {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string | null;
  break_minutes: number | null;
  total_hours: string | null;
  status: string;
  receipt_id: string;
  site_name: string | null;
}

interface RecordsResponse {
  shifts: RecordsShift[];
  next_cursor: string | null;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; shifts: RecordsShift[]; nextCursor: string | null }
  | { kind: 'error'; message: string };

export default function RecordsPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(async (cursor: string | null) => {
    const url = cursor
      ? `/api/field/records?cursor=${encodeURIComponent(cursor)}`
      : '/api/field/records';
    const res = await fetch(url);
    if (res.status === 401) {
      window.location.href = '/field';
      return null;
    }
    if (!res.ok) {
      throw new Error(`Could not load records (status ${res.status})`);
    }
    return (await res.json()) as RecordsResponse;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await fetchPage(null);
        if (cancelled || !json) return;
        setState({ kind: 'ready', shifts: json.shifts, nextCursor: json.next_cursor });
      } catch (err) {
        if (cancelled) return;
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Could not load records',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  const handleLoadMore = useCallback(async () => {
    if (state.kind !== 'ready' || !state.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const json = await fetchPage(state.nextCursor);
      if (!json) return;
      setState({
        kind: 'ready',
        shifts: [...state.shifts, ...json.shifts],
        nextCursor: json.next_cursor,
      });
    } catch {
      // Best-effort load-more; existing list stays visible on failure.
    } finally {
      setLoadingMore(false);
    }
  }, [state, loadingMore, fetchPage]);

  return (
    <main
      style={{
        background: palette.navy,
        color: palette.warm,
        minHeight: '100vh',
        fontFamily: typography.sans,
        padding: '20px 16px 40px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <TopNav />
        <Header />
        {state.kind === 'loading' && <LoadingState />}
        {state.kind === 'error' && <ErrorState message={state.message} />}
        {state.kind === 'ready' && state.shifts.length === 0 && <EmptyState />}
        {state.kind === 'ready' && state.shifts.length > 0 && (
          <>
            <ShiftList shifts={state.shifts} />
            {state.nextCursor && (
              <LoadMore loading={loadingMore} onClick={handleLoadMore} />
            )}
            <FooterTotals shifts={state.shifts} />
          </>
        )}
      </div>
    </main>
  );
}

// ═════════════════════════════════════════════════════════════════════
// TopNav — back to home + side label
// ═════════════════════════════════════════════════════════════════════
const TopNav: FC = () => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 24,
      fontFamily: typography.sans,
    }}
  >
    <a
      href="/field/home"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        color: palette.warmTextOnNavy,
        fontSize: 13,
        textDecoration: 'none',
      }}
    >
      <BackIcon />
      Home
    </a>
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: palette.mutedOnNavy,
      }}
    >
      Flostruction
    </div>
  </div>
);

// ═════════════════════════════════════════════════════════════════════
// Header
// ═════════════════════════════════════════════════════════════════════
const Header: FC = () => (
  <header style={{ marginBottom: 22 }}>
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: palette.warmTextOnNavy,
        opacity: 0.75,
        marginBottom: 4,
      }}
    >
      My records
    </div>
    <h1
      style={{
        fontFamily: typography.serif,
        fontSize: 28,
        fontWeight: 600,
        color: palette.warm,
        lineHeight: 1.18,
        margin: 0,
      }}
    >
      Every shift you&apos;ve worked.
    </h1>
    <p
      style={{
        fontSize: 14,
        color: palette.mutedOnNavy,
        lineHeight: 1.5,
        margin: '8px 0 0',
      }}
    >
      Sealed, timestamped, yours. Tap any shift to see the receipt.
    </p>
  </header>
);

// ═════════════════════════════════════════════════════════════════════
// Shift list
// ═════════════════════════════════════════════════════════════════════
const ShiftList: FC<{ shifts: RecordsShift[] }> = ({ shifts }) => (
  <ul
    style={{
      listStyle: 'none',
      padding: 0,
      margin: '0 0 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}
  >
    {shifts.map((s) => (
      <ShiftEntry key={s.id} shift={s} />
    ))}
  </ul>
);

const ShiftEntry: FC<{ shift: RecordsShift }> = ({ shift }) => {
  const tone = STATUS_TONE[shift.status] ?? STATUS_TONE.DEFAULT;
  return (
    <li>
      <a
        href={`/field/receipt/${shift.receipt_id}`}
        style={{
          display: 'block',
          background: palette.navyTint,
          color: palette.warm,
          borderRadius: radius.card,
          padding: '16px 18px',
          textDecoration: 'none',
          border: `1px solid ${palette.borderOnNavy}`,
          transition: 'background 120ms ease',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 6,
            gap: 12,
          }}
        >
          <div
            style={{
              fontFamily: typography.serif,
              fontSize: 17,
              fontWeight: 600,
              color: palette.warm,
              lineHeight: 1.25,
            }}
          >
            {formatDateLong(shift.shift_date + 'T12:00:00')}
          </div>
          <div
            style={{
              fontFamily: typography.mono,
              fontSize: 16,
              fontWeight: 700,
              color: palette.warm,
              whiteSpace: 'nowrap',
            }}
          >
            {shift.total_hours
              ? formatDecimalHours(parseFloat(shift.total_hours))
              : '—'}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 13,
              color: palette.mutedOnNavy,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              minWidth: 0,
            }}
          >
            {shift.site_name ?? 'Unknown site'}
          </div>
          <StatusPill label={tone.label} fg={tone.fg} bg={tone.bg} />
        </div>
      </a>
    </li>
  );
};

// ═════════════════════════════════════════════════════════════════════
// Status pill — same vocabulary as the home page WeekShiftsList
// ═════════════════════════════════════════════════════════════════════
const STATUS_TONE: Record<string, { label: string; fg: string; bg: string }> = {
  IN_PROGRESS: { label: 'in progress', fg: palette.warm, bg: 'rgba(217,165,72,0.18)' },
  SUBMITTED: { label: 'awaiting supervisor', fg: palette.warm, bg: 'rgba(217,165,72,0.18)' },
  SUPERVISOR_APPROVED: { label: 'sealed', fg: palette.warm, bg: 'rgba(45,95,63,0.32)' },
  PAYROLL_APPROVED: { label: 'sealed', fg: palette.warm, bg: 'rgba(45,95,63,0.32)' },
  EXPORTED: { label: 'sealed', fg: palette.warm, bg: 'rgba(45,95,63,0.32)' },
  DISPUTED: { label: 'under review', fg: palette.warm, bg: 'rgba(199,75,58,0.22)' },
  ADJUSTED: { label: 'adjusted', fg: palette.warm, bg: 'rgba(217,165,72,0.18)' },
  DEFAULT: { label: 'pending', fg: palette.warmTextOnNavy, bg: 'rgba(245,242,234,0.10)' },
};

const StatusPill: FC<{ label: string; fg: string; bg: string }> = ({ label, fg, bg }) => (
  <span
    style={{
      display: 'inline-block',
      padding: '4px 10px',
      borderRadius: radius.pill,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: fg,
      background: bg,
      whiteSpace: 'nowrap',
    }}
  >
    {label}
  </span>
);

// ═════════════════════════════════════════════════════════════════════
// Empty / loading / error / load-more / totals
// ═════════════════════════════════════════════════════════════════════
const EmptyState: FC = () => (
  <div
    style={{
      background: palette.navyTint,
      borderRadius: radius.card,
      padding: '32px 22px',
      border: `1px solid ${palette.borderOnNavy}`,
    }}
  >
    <div
      style={{
        fontFamily: typography.serif,
        fontSize: 20,
        color: palette.warm,
        lineHeight: 1.3,
        marginBottom: 8,
      }}
    >
      Your record starts on your first shift.
    </div>
    <div
      style={{
        fontSize: 14,
        color: palette.mutedOnNavy,
        lineHeight: 1.5,
      }}
    >
      Once you clock on and confirm a shift, it lands here. Sealed, timestamped, yours to keep.
    </div>
  </div>
);

const LoadingState: FC = () => (
  <div
    style={{
      padding: '40px 0',
      textAlign: 'center',
      color: palette.mutedOnNavy,
      fontSize: 14,
    }}
  >
    Loading your records…
  </div>
);

const ErrorState: FC<{ message: string }> = ({ message }) => (
  <div
    style={{
      background: palette.navyTint,
      borderRadius: radius.card,
      padding: '20px 18px',
      border: `1px solid rgba(199,75,58,0.4)`,
    }}
  >
    <div style={{ fontWeight: 700, color: palette.warm, marginBottom: 4 }}>
      Could not load records
    </div>
    <div style={{ fontSize: 13, color: palette.mutedOnNavy }}>{message}</div>
  </div>
);

const LoadMore: FC<{ loading: boolean; onClick: () => void }> = ({ loading, onClick }) => (
  <button
    onClick={onClick}
    disabled={loading}
    style={{
      width: '100%',
      padding: '12px',
      background: 'transparent',
      color: palette.warm,
      border: `1px solid ${palette.borderOnNavy}`,
      borderRadius: radius.button,
      fontFamily: typography.sans,
      fontWeight: 600,
      fontSize: 14,
      cursor: loading ? 'not-allowed' : 'pointer',
      marginTop: 4,
    }}
  >
    {loading ? 'Loading…' : 'Load earlier shifts'}
  </button>
);

const FooterTotals: FC<{ shifts: RecordsShift[] }> = ({ shifts }) => {
  const totalHours = shifts.reduce((acc, s) => {
    const h = s.total_hours ? parseFloat(s.total_hours) : 0;
    return acc + (Number.isFinite(h) ? h : 0);
  }, 0);
  return (
    <div
      style={{
        marginTop: 20,
        padding: '14px 18px',
        background: 'rgba(245,242,234,0.04)',
        borderRadius: radius.card,
        border: `1px solid ${palette.borderOnNavy}`,
        fontSize: 13,
        color: palette.mutedOnNavy,
        display: 'flex',
        justifyContent: 'space-between',
      }}
    >
      <span>Showing {shifts.length} {shifts.length === 1 ? 'shift' : 'shifts'}</span>
      <span style={{ fontFamily: typography.mono, color: palette.warm }}>
        {formatDecimalHours(totalHours)}
      </span>
    </div>
  );
};

// Small inline back chevron (matches the receipt page TopBar)
const BackIcon: FC = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);
