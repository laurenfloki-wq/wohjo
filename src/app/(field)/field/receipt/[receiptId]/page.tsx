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
import { TamperEvidenceBlock } from '@/components/field/WageProtectionNotice';
import { FieldErrorPanel, type FieldErrorCode } from '@/components/field/ErrorState';
import { palette, radius, typography } from '@/lib/field/tokens';
import { formatTimeAEST, formatDateLong } from '@/lib/field/format';

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

export default function ReceiptPage({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
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

      <div ref={receiptRef} style={{ width: '100%' }}>
        <ReceiptHero
          receiptId={shift.receipt_id}
          hashPrefix={data.chain_hash_prefix}
        />

        <section
          style={{
            background: palette.warm,
            color: palette.textPrimary,
            padding: '28px 24px 20px',
            fontFamily: typography.sans,
          }}
        >
          <ReceiptField label="Worker" value={`${data.worker.first_name} ${data.worker.last_name}`} />
          <ReceiptField label="Site" value={data.site_name ?? '—'} />
          {data.site_address && (
            <ReceiptField label="" value={data.site_address} secondary />
          )}
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
      </div>

      <div style={{ padding: '16px 24px 28px', background: palette.warm }}>
        <ShareReceiptButton receiptRef={receiptRef} receiptId={shift.receipt_id} />
        <a
          href="/field/home"
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'center',
            padding: '14px 20px',
            background: palette.navy,
            color: palette.warm,
            fontFamily: typography.sans,
            fontWeight: 700,
            fontSize: 15,
            borderRadius: radius.button,
            textDecoration: 'none',
            marginTop: 12,
          }}
        >
          Return Home
        </a>
      </div>
    </main>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Top bar — back arrow
// ═════════════════════════════════════════════════════════════════════
const TopBar: FC = () => (
  <div
    style={{
      background: palette.warm,
      padding: '16px 20px 8px',
      fontFamily: typography.sans,
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
  </div>
);

// ═════════════════════════════════════════════════════════════════════
// Hero block — receipt ID + hash (B2)
// ═════════════════════════════════════════════════════════════════════
const ReceiptHero: FC<{ receiptId: string; hashPrefix: string | null }> = ({
  receiptId,
  hashPrefix,
}) => (
  <section
    style={{
      background: palette.navy,
      color: palette.warm,
      padding: '32px 24px 28px',
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
        marginBottom: 14,
      }}
    >
      {receiptId}
    </div>
    {hashPrefix && (
      <div
        style={{
          fontFamily: typography.mono,
          fontSize: 12,
          color: palette.mutedOnNavy,
          letterSpacing: '0.02em',
        }}
      >
        hash: {hashPrefix}…
      </div>
    )}
  </section>
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
  const supervisorLabel: Record<string, { text: string; tone: 'green' | 'orange' | 'red' | 'navy' }> = {
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
      This timesheet is recorded on the Flostruction Workforce Ledger
      Evidentiary Standard. Receipt {receiptId} is your permanent record.
    </p>
    <p style={{ margin: '0 0 10px' }}>
      Flostruction verifies hours worked. It is not a payroll system. Your
      employer&apos;s payroll provider calculates pay.
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
