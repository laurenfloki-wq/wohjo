/**
 * Flostruction Field — Receipt screen
 * /field/receipt/[receiptId]
 *
 * Day 6 redesign (2026-04-22) — the receipt IS the product.
 * B2 spec: editorial-documentary register, legal artifact layout,
 * tamper-evidence block. A7: route gated — if end_time is null
 * the client redirects to /field/home rather than rendering partial
 * data. A4/A5: no FLOSMOSIS brand leak, correct WLES expansion.
 * A6: break_taken shown read-only (no selector). A8/A9: no red
 * primary, no emoji — Lucide icons or inline SVG only.
 */

'use client';

import { useEffect, useRef, useState, use, useCallback, type FC } from 'react';
import ShareReceiptButton from '@/components/field/ShareReceiptButton';
import ShareLinkButton from '@/components/field/ShareLinkButton';
import { TamperEvidenceBlock } from '@/components/field/WageProtectionNotice';
import { FieldErrorPanel, type FieldErrorCode } from '@/components/field/ErrorState';
import { palette, radius, typography } from '@/lib/field/tokens';
import { formatTimeAEST, formatDateLong } from '@/lib/field/format';
import { FMark } from '@/components/field/v1/FMark';
import SealExpandable from '@/components/field/SealExpandable';

interface ReceiptData {
  shift: {
    id: string;
    receipt_id: string;
    shift_date: string;
    start_time: string;
    end_time: string | null;
    break_minutes: number;
    total_hours: string;
    status: string;
    worker_note: string | null;
  };
  worker: {
    first_name: string;
    last_name: string;
    pay_rate: string;
  };
  site_name: string | null;
  site_address: string | null;
  is_complete: boolean;
  chain_hash_prefix: string | null;
  intelligence_status: 'VERIFIED' | 'FLAGGED' | 'PENDING';
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; code: FieldErrorCode; receiptId: string }
  | { kind: 'ready'; data: ReceiptData };

export default function ReceiptPage({ params }: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = use(params);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const receiptRef = useRef<HTMLDivElement>(null);

  const loadReceipt = useCallback(async () => {
    try {
      const res = await fetch(`/api/field/receipt/${receiptId}`);
      if (res.status === 401) {
        setState({ kind: 'error', code: 'SESSION_EXPIRED', receiptId });
        return;
      }
      if (!res.ok) {
        setState({ kind: 'error', code: 'RECEIPT_GEN_FAILED', receiptId });
        return;
      }
      const json = (await res.json()) as ReceiptData;

      // A7: the receipt is a record of a COMPLETED shift. If the shift
      // is still in progress (server flag is_complete=false, which
      // mirrors end_time IS NULL), redirect to /field/home. No partial
      // render permitted.
      if (!json.is_complete) {
        window.location.href = '/field/home';
        return;
      }

      setState({ kind: 'ready', data: json });
    } catch {
      setState({ kind: 'error', code: 'RECEIPT_GEN_FAILED', receiptId });
    }
  }, [receiptId]);

  useEffect(() => {
    if (!receiptId) return;
    void loadReceipt();
  }, [receiptId, loadReceipt]);

  // MINOR-1 (CRACK 222) — set the first-shift-sealed flag the moment the
  // worker successfully sees their first sealed receipt. OnboardingBanner
  // reads this flag and only renders after it is set, so the banner never
  // appears before the worker has experienced a sealed shift.
  useEffect(() => {
    if (state.kind !== 'ready') return;
    if (!state.data.chain_hash_prefix) return;
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('worker-first-shift-sealed-v1', 'true');
    } catch {
      // localStorage may be disabled (private mode etc.); banner just
      // never shows in that case — acceptable degradation.
    }
  }, [state]);

  if (state.kind === 'loading') {
    return <LoadingScreen />;
  }

  if (state.kind === 'error') {
    return (
      <main style={pageShell()}>
        <div style={{ maxWidth: 480, width: '100%' }}>
          <FieldErrorPanel
            code={state.code}
            receiptId={state.receiptId}
            onRetry={() => {
              setState({ kind: 'loading' });
              void loadReceipt();
            }}
          />
          <div style={{ marginTop: 16 }}>
            <a
              href="/field/home"
              style={{
                fontFamily: typography.sans,
                color: palette.textSecondary,
                fontSize: 14,
                textDecoration: 'underline',
              }}
            >
              Return home
            </a>
          </div>
        </div>
      </main>
    );
  }

  const { data } = state;
  const shift = data.shift;

  return (
    <main style={pageShell()}>
      <TopBar />

      <div ref={receiptRef} style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
        {/* v1 visual coat — F-mark watermark on the receipt card.
            Static at 0.12 opacity per founder PP1 direction. Forest
            tone reads as the seal/permanence affordance against the
            cream surface. Anchored bottom-right; pointer-events:none. */}
        <FMark tone="forest" placement="bottom-right" size={120} opacity={0.12} />

        {/* v1 visual coat — top serration edge (semicircular notches
            cut into the card silhouette), per design-branch spec
            (brandComponents.receiptCard.serrationDiameter=12px,
            stride=20px). Renders as inline SVG drawn in the page's
            background colour — the notches "remove" cream from the
            top edge of the receipt-card stack. */}
        <SerrationEdge edge="top" />

        <ReceiptHero
          receiptId={shift.receipt_id}
          hashPrefix={data.chain_hash_prefix}
          siteName={data.site_name}
          shiftDate={shift.shift_date}
        />

        <section
          style={{
            background: palette.warm,
            color: palette.textPrimary,
            padding: '28px 24px 20px',
            fontFamily: typography.sans,
          }}
        >
          <ReceiptField
            label="Worker"
            value={`${data.worker.first_name} ${data.worker.last_name}`}
          />
          <ReceiptField label="Site" value={data.site_name ?? '—'} />
          {data.site_address && <ReceiptField label="" value={data.site_address} secondary />}
          <ReceiptField label="Date" value={formatDateLong(shift.shift_date + 'T12:00:00')} />

          <Divider />

          <ReceiptTimeRow
            label="Arrived"
            value={formatTimeAEST(shift.start_time)}
            annotation="verified GPS"
          />
          <ReceiptTimeRow
            label="Departed"
            value={shift.end_time ? formatTimeAEST(shift.end_time) : '—'}
            annotation="verified GPS"
          />
          <ReceiptTimeRow
            label="Break"
            value={shift.break_minutes > 0 ? `${shift.break_minutes}m` : 'None'}
            annotation="worker-declared"
          />
          <ReceiptTimeRow
            label="Duration"
            value={`${parseFloat(shift.total_hours).toFixed(2)} hrs`}
            annotation="verified"
            strong
          />

          {shift.worker_note && (
            <>
              <Divider />
              <ReceiptField label="Your note" value={shift.worker_note} />
            </>
          )}
        </section>

        <div style={{ background: palette.warm, padding: '0 24px' }}>
          <TamperEvidenceBlock />
        </div>

        <section style={{ background: palette.warm, padding: '4px 24px 24px' }}>
          <StatusRow status={shift.status} intelligence={data.intelligence_status} />
        </section>

        <LegalFooter receiptId={shift.receipt_id} />

        {/* v1 visual coat — bottom serration edge mirrors the top
            edge above. Together they give the receipt card the
            torn-ticket silhouette per design-branch mockup. */}
        <SerrationEdge edge="bottom" />
      </div>

      <div style={{ padding: '16px 24px 28px', background: palette.warm }}>
        <ShareReceiptButton receiptRef={receiptRef} receiptId={shift.receipt_id} />
        <ShareLinkButton receiptId={shift.receipt_id} />
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <a
            href="/field/records"
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '14px 16px',
              background: 'transparent',
              color: palette.navy,
              fontFamily: typography.sans,
              fontWeight: 700,
              fontSize: 15,
              borderRadius: radius.button,
              textDecoration: 'none',
              border: `1px solid ${palette.navy}`,
            }}
          >
            My records
          </a>
          <a
            href="/field/home"
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '14px 16px',
              background: palette.navy,
              color: palette.warm,
              fontFamily: typography.sans,
              fontWeight: 700,
              fontSize: 15,
              borderRadius: radius.button,
              textDecoration: 'none',
            }}
          >
            Home
          </a>
        </div>
      </div>
    </main>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Top bar — back to home + records nav
// 2026-04-30 evening: added "My records" so a worker arriving at this
// page from the SMS deep-link can navigate to their full history.
// ═════════════════════════════════════════════════════════════════════
const TopBar: FC = () => (
  <div
    style={{
      background: palette.warm,
      padding: '16px 20px 8px',
      fontFamily: typography.sans,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}
  >
    <a
      href="/field/home"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        color: palette.textSecondary,
        fontSize: 13,
        textDecoration: 'none',
      }}
    >
      <BackIcon />
      Home
    </a>
    <a
      href="/field/records"
      style={{
        color: palette.textSecondary,
        fontSize: 13,
        textDecoration: 'none',
        fontWeight: 600,
      }}
    >
      My records
    </a>
  </div>
);

// ═════════════════════════════════════════════════════════════════════
// Hero block — receipt ID + sealed ribbon (B2)
// 2026-04-30 evening — restructured per labour-hire-workflow-gap-analysis-
// 2026-04-29 §G12 / Workstream 2 receipt-page polish. Pre-rewrite the
// hash sat as a subdued mono line at opacity 0.58. Now the hash is its
// own SEALED ribbon under the receipt ID — lock icon, mono prefix at
// readable size, "SEALED" label. The worker, exhausted, sees the seal
// in the first 200 ms of the page load.
// ═════════════════════════════════════════════════════════════════════
const ReceiptHero: FC<{
  receiptId: string;
  hashPrefix: string | null;
  siteName: string | null;
  shiftDate: string;
}> = ({ receiptId, hashPrefix, siteName, shiftDate }) => (
  <section
    style={{
      background: palette.navy,
      color: palette.warm,
      padding: '32px 24px 24px',
      fontFamily: typography.sans,
    }}
  >
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: palette.warmTextOnNavy,
        opacity: 0.7,
        marginBottom: 10,
      }}
    >
      Receipt
    </div>
    <div
      style={{
        fontFamily: typography.mono,
        fontSize: 26,
        fontWeight: 700,
        letterSpacing: '0.04em',
        color: palette.warm,
        lineHeight: 1.1,
        marginBottom: 18,
      }}
    >
      {receiptId}
    </div>
    {hashPrefix && (
      <SealedRibbon hashPrefix={hashPrefix} siteName={siteName} shiftDate={shiftDate} />
    )}
    {hashPrefix && <SealExpandable />}
  </section>
);

// ─── Sealed ribbon ──────────────────────────────────────────────────────
// The hash is the proof. Surface it that way: lock icon, "SEALED" label,
// hash prefix in mono at readable size, all inside a subtle bordered
// block so it reads as its own affordance not just body text.
//
// DEV-4 (CRACK 222): aria-label reads the human-meaningful seal facts —
// site + date + verification status. The hash prefix is removed from
// aria because a screen reader announcing 8 hex chars adds friction
// without conveying meaning to a worker. The hash remains visible in
// the ribbon for sighted users (and is still the actual proof
// artifact).
const SealedRibbon: FC<{
  hashPrefix: string;
  siteName: string | null;
  shiftDate: string;
}> = ({ hashPrefix, siteName, shiftDate }) => (
  <div
    role="region"
    aria-label={`Sealed record. Site: ${siteName ?? 'unknown'}. Date: ${shiftDate}. Cryptographic verification status: verified.`}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 14px',
      background: 'rgba(45,95,63,0.18)',
      border: '1px solid rgba(45,95,63,0.6)',
      borderRadius: radius.button,
    }}
  >
    <SealLockIcon />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: palette.warm,
          opacity: 0.85,
          marginBottom: 2,
        }}
      >
        Sealed
      </div>
      <div
        style={{
          fontFamily: typography.mono,
          fontSize: 14,
          fontWeight: 600,
          color: palette.warm,
          letterSpacing: '0.04em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={`SHA-256 hash prefix: ${hashPrefix}`}
      >
        {hashPrefix}…
      </div>
    </div>
  </div>
);

const SealLockIcon: FC = () => (
  <svg
    width={20}
    height={20}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ color: palette.warm, flexShrink: 0 }}
  >
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

// ═════════════════════════════════════════════════════════════════════
// Field rows
// ═════════════════════════════════════════════════════════════════════
const ReceiptField: FC<{ label: string; value: string; secondary?: boolean }> = ({
  label,
  value,
  secondary,
}) => (
  <div style={{ marginBottom: secondary ? 14 : 16 }}>
    {label && (
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: palette.textTertiary,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
    )}
    <div
      style={{
        fontFamily: secondary ? typography.sans : typography.serif,
        fontSize: secondary ? 14 : 17,
        lineHeight: 1.35,
        color: secondary ? palette.textSecondary : palette.textPrimary,
        fontWeight: secondary ? 400 : 500,
      }}
    >
      {value}
    </div>
  </div>
);

const ReceiptTimeRow: FC<{
  label: string;
  value: string;
  annotation: string;
  strong?: boolean;
}> = ({ label, value, annotation, strong }) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: '100px 1fr auto',
      alignItems: 'baseline',
      gap: 12,
      padding: '10px 0',
      borderBottom: `1px solid ${palette.border}`,
    }}
  >
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        color: palette.textTertiary,
      }}
    >
      {label}
    </span>
    <span
      style={{
        fontFamily: typography.mono,
        fontSize: strong ? 18 : 15,
        fontWeight: strong ? 700 : 500,
        color: palette.textPrimary,
      }}
    >
      {value}
    </span>
    <span
      style={{
        fontSize: 11,
        color: strong ? palette.greenText : palette.textTertiary,
        fontWeight: strong ? 700 : 500,
        letterSpacing: '0.02em',
      }}
    >
      {annotation}
    </span>
  </div>
);

const Divider: FC = () => (
  <div style={{ height: 1, background: palette.border, margin: '14px 0' }} />
);

// ═════════════════════════════════════════════════════════════════════
// Status row — supervisor + intelligence
// ═════════════════════════════════════════════════════════════════════
const StatusRow: FC<{
  status: string;
  intelligence: 'VERIFIED' | 'FLAGGED' | 'PENDING';
}> = ({ status, intelligence }) => {
  const supervisorLabel: Record<
    string,
    { text: string; tone: 'green' | 'orange' | 'red' | 'navy' }
  > = {
    IN_PROGRESS: { text: 'In progress', tone: 'orange' },
    SUBMITTED: { text: 'Awaiting supervisor', tone: 'orange' },
    SUPERVISOR_APPROVED: { text: 'Supervisor approved', tone: 'green' },
    PAYROLL_APPROVED: { text: 'Payroll approved', tone: 'green' },
    EXPORTED: { text: 'Exported to payroll', tone: 'navy' },
    DISPUTED: { text: 'Under review', tone: 'red' },
  };
  const s = supervisorLabel[status] ?? { text: status.toLowerCase(), tone: 'navy' as const };

  const toneMap = {
    green: { fg: palette.greenText, bg: palette.greenTint },
    orange: { fg: palette.orange, bg: palette.orangeTint },
    red: { fg: palette.red, bg: palette.redTint },
    navy: { fg: palette.navy, bg: palette.border },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: palette.textTertiary,
        }}
      >
        Status
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Chip fg={toneMap[s.tone].fg} bg={toneMap[s.tone].bg} label={s.text} />
        <Chip
          fg={intelligence === 'VERIFIED' ? palette.greenText : palette.textSecondary}
          bg={intelligence === 'VERIFIED' ? palette.greenTint : palette.border}
          label={
            intelligence === 'VERIFIED'
              ? 'Flostruction verified'
              : intelligence === 'FLAGGED'
                ? 'Verification in progress'
                : 'Verification in progress'
          }
        />
      </div>
    </div>
  );
};

const Chip: FC<{ fg: string; bg: string; label: string }> = ({ fg, bg, label }) => (
  <span
    style={{
      display: 'inline-block',
      padding: '5px 12px',
      borderRadius: radius.pill,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      color: fg,
      background: bg,
    }}
  >
    {label}
  </span>
);

// ═════════════════════════════════════════════════════════════════════
// Legal footer — Q2 exact replacement text
// ═════════════════════════════════════════════════════════════════════
const LegalFooter: FC<{ receiptId: string }> = ({ receiptId }) => (
  <footer
    style={{
      background: palette.warm,
      padding: '18px 24px 28px',
      borderTop: `1px solid ${palette.border}`,
      fontFamily: typography.sans,
      fontSize: 12,
      lineHeight: 1.6,
      color: palette.textTertiary,
    }}
  >
    <p style={{ margin: '0 0 10px' }}>
      This timesheet is recorded on the Flostruction Workforce Ledger Evidentiary Standard. Receipt{' '}
      {receiptId} is your permanent record.
    </p>
    <p style={{ margin: '0 0 10px' }}>
      Flostruction verifies hours worked. It is not a payroll system. Your employer&apos;s payroll
      provider calculates pay.
    </p>
    <p style={{ margin: 0, color: palette.textTertiary }}>
      FLOSMOSIS PTY LTD — ACN 697 323 925 — flosmosis.com
    </p>
  </footer>
);

// ═════════════════════════════════════════════════════════════════════
// Loading + icons
// ═════════════════════════════════════════════════════════════════════
const LoadingScreen: FC = () => (
  <main style={pageShell()}>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '40vh',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          border: `3px solid ${palette.border}`,
          borderTopColor: palette.navy,
          borderRadius: '50%',
          animation: 'receipt-spin 0.8s linear infinite',
        }}
      />
      <style>{`@keyframes receipt-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  </main>
);

const BackIcon: FC = () => (
  <svg
    width={14}
    height={14}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

function pageShell(): React.CSSProperties {
  return {
    minHeight: '100dvh',
    background: palette.warm,
    color: palette.textPrimary,
    maxWidth: 480,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: typography.sans,
  };
}

// ═════════════════════════════════════════════════════════════════════
// v1 visual coat — SerrationEdge
// ═════════════════════════════════════════════════════════════════════
// Semicircular notches cut into the top or bottom edge of the receipt
// card. Mirrors brandComponents.receiptCard:
//   serrationDiameter = 12px
//   serrationStride   = 20px
// Notches are filled in the page background colour so they "remove"
// cream from the card silhouette, producing the torn-ticket reading.
//
// Implemented as inline SVG with a repeating <pattern>. The pattern
// uses the page background colour (cream) as the notch fill on the
// receipt card surface. CSS-only would require multiple linear
// gradients; SVG keeps a single source of truth for the geometry.
const SerrationEdge: FC<{ edge: 'top' | 'bottom' }> = ({ edge }) => {
  const SERRATION_DIAMETER = 12;
  const SERRATION_STRIDE = 20;
  const HEIGHT = SERRATION_DIAMETER / 2 + 1; // half-circle plus 1px overlap
  const TILE_W = SERRATION_STRIDE;
  // For top edge: half-circles at the bottom of the SVG are notches
  // cut from the BOTTOM of the cream strip above (i.e., the page bg).
  // For bottom edge: half-circles at the top of the SVG do the same
  // for the BOTTOM of the receipt card.
  const cy = edge === 'top' ? HEIGHT : 0;
  return (
    <svg
      aria-hidden="true"
      width="100%"
      height={HEIGHT}
      viewBox={`0 0 ${TILE_W} ${HEIGHT}`}
      preserveAspectRatio="none"
      style={{
        display: 'block',
        background: palette.warm,
        color: palette.warm,
      }}
    >
      <defs>
        <pattern
          id={`serr-${edge}`}
          x="0"
          y="0"
          width={SERRATION_STRIDE}
          height={HEIGHT}
          patternUnits="userSpaceOnUse"
        >
          <rect x="0" y="0" width={SERRATION_STRIDE} height={HEIGHT} fill={palette.warm} />
          <circle
            cx={SERRATION_STRIDE / 2}
            cy={cy}
            r={SERRATION_DIAMETER / 2}
            fill={palette.warmTint}
          />
        </pattern>
      </defs>
      <rect width="100%" height={HEIGHT} fill={`url(#serr-${edge})`} />
    </svg>
  );
};
