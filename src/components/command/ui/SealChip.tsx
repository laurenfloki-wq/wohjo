// FLOSTRUCTION /command — SealChip.
// Thin signature wrapper over the Chip primitive: "Verified · Sealed"
// (or supplied label) + optional receipt-id tag. Renders through the
// same Chip element StatusChip does, so the two sit pixel-identical
// on one baseline.

import type { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Chip, CHIP_GEOMETRY, type ChipSize } from './Chip';

interface Props {
  receiptId?: string | null;
  onClick?: () => void;
  /** Title-line label override. Defaults to "Verified · Sealed". */
  label?: ReactNode;
  /** Show the receipt id beside the label, when known. */
  showReceiptId?: boolean;
  size?: ChipSize;
}

export function SealChip({
  receiptId,
  onClick,
  label = 'Verified · Sealed',
  showReceiptId = true,
  size = 'md',
}: Props) {
  const g = CHIP_GEOMETRY[size];
  return (
    <Chip
      bg="var(--verified-bg)"
      fg="var(--verified)"
      border="var(--verified-border)"
      size={size}
      onClick={onClick}
      ariaLabel={`Sealed receipt ${receiptId ?? ''}`.trim()}
    >
      <ShieldCheck size={g.iconSize} strokeWidth={1.8} aria-hidden />
      <span>{label}</span>
      {showReceiptId && receiptId ? (
        <span
          style={{
            // Inline label that sits INSIDE the chip's fixed height —
            // padding + border are purely horizontal so the chip never
            // grows vertically because of this tag.
            fontFamily: 'var(--font-mono)',
            color: 'var(--verified)',
            opacity: 0.78,
            paddingLeft: 8,
            marginLeft: 2,
            borderLeft: '1px solid var(--verified-border)',
            fontSize: 10,
            letterSpacing: '0.04em',
            lineHeight: 1,
          }}
        >
          {receiptId.slice(0, 10)}
        </span>
      ) : null}
    </Chip>
  );
}
