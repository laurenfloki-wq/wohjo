// Flostruction Field — First-login onboarding (B6)
// Full-screen panel shown once, when worker has no shifts ever AND no
// active shift. After acknowledgement, the worker lands on the State 1
// (no shift today) home-screen panel.

'use client';

import { type FC } from 'react';
import { palette, radius, typography } from '@/lib/field/tokens';

interface Props {
  firstName: string;
  siteName: string | null;
  onAcknowledge: () => void;
}

export const OnboardingPanel: FC<Props> = ({ firstName, siteName, onAcknowledge }) => {
  return (
    <section
      style={{
        minHeight: '100dvh',
        background: palette.navy,
        color: palette.warm,
        padding: '48px 24px 40px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        fontFamily: typography.sans,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 440 }}>
        <div
          style={{
            fontFamily: typography.sans,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: palette.warmTextOnNavy,
            opacity: 0.7,
          }}
        >
          Flostruction
        </div>
        <h1
          style={{
            fontFamily: typography.serif,
            fontSize: 34,
            lineHeight: 1.15,
            fontWeight: 600,
            margin: 0,
            color: palette.warm,
          }}
        >
          Welcome to Flostruction, {firstName}.
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.55, margin: 0, color: palette.warmTextOnNavy }}>
          Your hours{siteName ? ` at ${siteName}` : ''} will be verified automatically
          when you arrive on site. You will see your shift build here as you work.
        </p>
        <p style={{ fontSize: 16, lineHeight: 1.55, margin: 0, color: palette.warmTextOnNavy }}>
          When you are done for the day, tap End Shift and confirm your break.
          You will get a receipt that cannot be altered.
        </p>
      </div>
      <button
        onClick={onAcknowledge}
        style={{
          width: '100%',
          padding: '16px 20px',
          background: palette.warm,
          color: palette.navy,
          fontFamily: typography.sans,
          fontWeight: 700,
          fontSize: 16,
          border: 'none',
          borderRadius: radius.button,
          cursor: 'pointer',
          marginTop: 32,
        }}
      >
        Got it — let&apos;s start
      </button>
    </section>
  );
};
