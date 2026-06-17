// Flostruction Field — Error states
// B8: every possible error has a designed UI. No red stack traces, no
// generic "Something went wrong," no silent failures. Each error
// carries: non-technical explanation, recommended action, fallback.
//
// Canonical error codes (synced with server):
//   GEOFENCE_DENIED
//   GEOFENCE_LOST_MID_SHIFT
//   SHIFT_END_NETWORK
//   ZERO_OR_NEGATIVE_DURATION
//   SUPERVISOR_SMS_FAILED
//   RECEIPT_GEN_FAILED
//   SESSION_EXPIRED
//   CLOCK_SKEW

'use client';

import { type FC } from 'react';
import { palette, radius, typography } from '@/lib/field/tokens';

export type FieldErrorCode =
  | 'GEOFENCE_DENIED'
  | 'GEOFENCE_LOST_MID_SHIFT'
  | 'SHIFT_END_NETWORK'
  | 'ZERO_OR_NEGATIVE_DURATION'
  | 'SUPERVISOR_SMS_FAILED'
  | 'RECEIPT_GEN_FAILED'
  | 'SESSION_EXPIRED'
  | 'CLOCK_SKEW'
  | 'ALREADY_STARTED_TODAY';

export interface ErrorCopy {
  title: string;
  explanation: string;
  actionLabel: string | null;
  actionHref?: string;
}

const SUPPORT_EMAIL = 'support@flosmosis.com';

function supportMailto(receiptId?: string): string {
  const subject = receiptId
    ? `Flostruction support — receipt ${receiptId}`
    : 'Flostruction support';
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

export const ERROR_COPY: Record<FieldErrorCode, (receiptId?: string) => ErrorCopy> = {
  GEOFENCE_DENIED: () => ({
    title: 'Location access is turned off',
    explanation:
      "We couldn't verify your arrival — your phone's GPS may be off. " +
      'Without location, we can record your shift manually, but you lose ' +
      'automatic GPS verification.',
    actionLabel: 'Turn on Location Services and refresh',
    actionHref: '#retry',
  }),
  GEOFENCE_LOST_MID_SHIFT: () => ({
    title: 'We lost your location mid-shift',
    explanation:
      'Location access was turned off or the signal dropped. Your arrival ' +
      "time was recorded — but without location we can't verify your " +
      'departure.',
    actionLabel: 'Re-enable Location Services',
    actionHref: '#retry',
  }),
  SHIFT_END_NETWORK: (receiptId) => ({
    title: "Couldn't save your end-of-shift",
    explanation:
      'Your phone is offline or our servers are unreachable. Your shift ' +
      'is still running — once you have signal, tap End Shift again.',
    actionLabel: 'Contact support if this keeps happening',
    actionHref: supportMailto(receiptId),
  }),
  ZERO_OR_NEGATIVE_DURATION: (receiptId) => ({
    title: "Your shift's timing looks wrong",
    explanation:
      "The end time isn't after the start time, or the shift is shorter " +
      'than we can record. This can happen if your phone clock is off, ' +
      'or if End Shift was tapped right after Start Shift.',
    actionLabel: 'Contact support with your receipt ID',
    actionHref: supportMailto(receiptId),
  }),
  SUPERVISOR_SMS_FAILED: (receiptId) => ({
    title: 'Your supervisor may not have received the SMS',
    explanation:
      'Your shift was submitted, but the notification text to your ' +
      "supervisor didn't go through. Your shift is safe — we'll retry " +
      'automatically, and your receipt is on record.',
    actionLabel: 'Contact support if your supervisor never receives it',
    actionHref: supportMailto(receiptId),
  }),
  RECEIPT_GEN_FAILED: (receiptId) => ({
    title: "Couldn't generate your receipt",
    explanation:
      'Your shift was recorded, but we had trouble creating the receipt. ' +
      'Try refreshing — if the receipt still is not available in a few ' +
      'minutes, contact support.',
    actionLabel: 'Contact support',
    actionHref: supportMailto(receiptId),
  }),
  SESSION_EXPIRED: () => ({
    title: 'You have been signed out',
    explanation:
      'Your sign-in expired while you were on site. Your shift is safe — ' +
      'sign in again with the same phone number and you will pick up ' +
      'right where you left off.',
    actionLabel: 'Sign in again',
    actionHref: '/field',
  }),
  CLOCK_SKEW: (receiptId) => ({
    title: "Your phone's clock is off",
    explanation:
      "Your phone's clock is significantly different from our servers. " +
      'Your shift time has been verified from our servers, not your ' +
      'phone — so your pay is safe. You may want to check your phone ' +
      'time settings.',
    actionLabel: 'Contact support if this seems wrong',
    actionHref: supportMailto(receiptId),
  }),
  ALREADY_STARTED_TODAY: () => ({
    title: "You've already started today's shift",
    explanation:
      'Each worker records one shift per day, and today’s is already on ' +
      "record — you'll see it under “This week's shifts” below. If the " +
      'hours look wrong, your supervisor can adjust them when they approve.',
    actionLabel: null,
  }),
};

export const FieldErrorPanel: FC<{
  code: FieldErrorCode;
  receiptId?: string;
  onRetry?: () => void;
}> = ({ code, receiptId, onRetry }) => {
  const copy = ERROR_COPY[code](receiptId);
  const isRetryHref = copy.actionHref === '#retry';

  return (
    <section
      style={{
        background: palette.warm,
        border: `1px solid ${palette.orange}`,
        borderLeft: `4px solid ${palette.orange}`,
        borderRadius: radius.card,
        padding: '20px 18px',
        fontFamily: typography.sans,
        color: palette.textPrimary,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
      role="alert"
      aria-live="polite"
    >
      <div
        style={{
          fontFamily: typography.sans,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: palette.orange,
        }}
      >
        Something went wrong
      </div>
      <h2
        style={{
          fontFamily: typography.serif,
          fontSize: 22,
          lineHeight: 1.25,
          fontWeight: 600,
          margin: 0,
          color: palette.textPrimary,
        }}
      >
        {copy.title}
      </h2>
      <p style={{ fontSize: 14, lineHeight: 1.55, margin: 0, color: palette.textSecondary }}>
        {copy.explanation}
      </p>
      {copy.actionLabel &&
        (isRetryHref && onRetry ? (
          <button
            onClick={onRetry}
            style={{
              background: palette.navy,
              color: palette.warm,
              border: 'none',
              borderRadius: radius.button,
              padding: '12px 16px',
              fontFamily: typography.sans,
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
              alignSelf: 'flex-start',
            }}
          >
            {copy.actionLabel}
          </button>
        ) : copy.actionHref ? (
          <a
            href={copy.actionHref}
            style={{
              background: palette.navy,
              color: palette.warm,
              borderRadius: radius.button,
              padding: '12px 16px',
              fontFamily: typography.sans,
              fontWeight: 600,
              fontSize: 14,
              textDecoration: 'none',
              alignSelf: 'flex-start',
            }}
          >
            {copy.actionLabel}
          </a>
        ) : null)}
      {receiptId && (
        <div
          style={{
            fontFamily: typography.mono,
            fontSize: 11,
            color: palette.textTertiary,
            marginTop: 4,
          }}
        >
          receipt: {receiptId}
        </div>
      )}
    </section>
  );
};
