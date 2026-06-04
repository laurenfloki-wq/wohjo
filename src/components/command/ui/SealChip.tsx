// FLOSTRUCTION /command — SealChip.
// The first signature moment. A quietly confident "Verified · Sealed"
// chip carrying the receipt id. Click opens the ReceiptDrawer for
// progressive disclosure.

import type { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';

interface Props {
  receiptId?: string | null;
  onClick?: () => void;
  /** Title-line label override. Defaults to "Verified · Sealed". */
  label?: ReactNode;
  /** Show the receipt id beside the label, when known. */
  showReceiptId?: boolean;
}

export function SealChip({
  receiptId,
  onClick,
  label = 'Verified · Sealed',
  showReceiptId = true,
}: Props) {
  const interactive = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        background: 'var(--verified-bg)',
        border: '1px solid var(--verified-border)',
        color: 'var(--verified)',
        padding: '5px 10px 5px 8px',
        borderRadius: 'var(--r-pill)',
        fontSize: 'var(--t-xs)',
        fontWeight: 500,
        letterSpacing: '0.01em',
        cursor: interactive ? 'pointer' : 'default',
        transition: 'background var(--dur-fast) var(--ease)',
        minHeight: 28,
      }}
      aria-label={`Sealed receipt ${receiptId ?? ''}`.trim()}
    >
      <ShieldCheck size={14} strokeWidth={1.6} aria-hidden />
      <span>{label}</span>
      {showReceiptId && receiptId ? (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--verified)',
            opacity: 0.78,
            paddingLeft: 6,
            borderLeft: '1px solid var(--verified-border)',
            marginLeft: 2,
            fontSize: 11,
          }}
        >
          {receiptId.slice(0, 10)}
        </span>
      ) : null}
    </button>
  );
}
