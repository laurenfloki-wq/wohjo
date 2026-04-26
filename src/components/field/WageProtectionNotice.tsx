// Flostruction Field — Wage-theft-protection messaging (B7)
// Two variants: in-shift (during active shift, on home screen) and
// tamper-evidence (on receipt screen, B2 block).

'use client';

import { type FC } from 'react';
import { palette, radius, typography } from '@/lib/field/tokens';

export const InShiftProtectionNotice: FC = () => (
  <p
    style={{
      fontFamily: typography.sans,
      fontSize: 13,
      lineHeight: 1.55,
      color: palette.mutedOnNavy,
      margin: 0,
    }}
  >
    Your arrival and departure are being verified by GPS.
    You will receive a permanent receipt when you end your shift.
  </p>
);

export const TamperEvidenceBlock: FC = () => (
  <section
    style={{
      background: palette.navy,
      color: palette.warm,
      padding: '22px 22px',
      borderRadius: radius.card,
      fontFamily: typography.sans,
      fontSize: 14,
      lineHeight: 1.6,
      margin: '16px 0',
    }}
  >
    <div
      style={{
        fontFamily: typography.sans,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        color: palette.warmTextOnNavy,
        marginBottom: 10,
        opacity: 0.75,
      }}
    >
      Tamper-evidence
    </div>
    <p style={{ margin: 0, color: palette.warmTextOnNavy }}>
      This receipt cannot be altered. Your arrival and departure were
      verified by GPS. The record is hash-chained — any attempt to
      modify it breaks the chain and raises an alert. The record is
      permanent, timestamped, and exportable.
    </p>
  </section>
);
