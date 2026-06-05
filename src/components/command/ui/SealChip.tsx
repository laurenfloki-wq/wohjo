// FLOSTRUCTION /command — SealChip.
// The first signature moment. A quietly confident "Verified · Sealed"
// chip carrying the receipt id. Click opens the ReceiptDrawer for
// progressive disclosure.
//
// Shape is shared with StatusChip via SHARED_CHIP_BASE so the two sit
// on one baseline when rendered side-by-side. Only the verified colour
// + the shield icon + the optional receipt-id tag distinguishes it.

import type { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { SHARED_CHIP_BASE } from './StatusChip';

interface Props {
  receiptId?: string | null;
  onClick?: () => void;
  /** Title-line label override. Defaults to "Verified · Sealed". */
  label?: ReactNode;
  /** Show the receipt id beside the label, when known. */
  showReceiptId?: boolean;
  /** Match StatusChip size variants. */
  size?: 'sm' | 'md';
}

export function SealChip({
  receiptId,
  onClick,
  label = 'Verified · Sealed',
  showReceiptId = true,
  size = 'md',
}: Props) {
  const interactive = !!onClick;
  const geom = SHARED_CHIP_BASE[size];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: geom.height,
        padding: geom.padding,
        background: 'var(--verified-bg)',
        border: '1px solid var(--verified-border)',
        color: 'var(--verified)',
        borderRadius: geom.radius,
        fontSize: geom.fontSize,
        fontWeight: 500,
        lineHeight: 1,
        letterSpacing: '0.01em',
        cursor: interactive ? 'pointer' : 'default',
        transition: 'background var(--dur-fast) var(--ease)',
        verticalAlign: 'middle',
        boxSizing: 'border-box',
        fontVariantNumeric: 'tabular-nums lining-nums',
        whiteSpace: 'nowrap',
      }}
      aria-label={`Sealed receipt ${receiptId ?? ''}`.trim()}
    >
      <ShieldCheck size={12} strokeWidth={1.8} aria-hidden />
      <span>{label}</span>
      {showReceiptId && receiptId ? (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--verified)',
            opacity: 0.78,
            paddingLeft: 8,
            marginLeft: 2,
            borderLeft: '1px solid var(--verified-border)',
            fontSize: 10,
            letterSpacing: '0.04em',
          }}
        >
          {receiptId.slice(0, 10)}
        </span>
      ) : null}
    </button>
  );
}
