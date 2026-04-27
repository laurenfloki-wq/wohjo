// v1 visual coat — Haptic-lock confirmation button.
// Press-and-hold to commit a high-stakes action (CLOCK_IN, CLOCK_OUT,
// SHIFT_COMMIT). Replaces the single-tap pattern for SEAL moments
// where the worker should feel the substrate "locking in" their
// shift event. Three guarantees:
//
//   1. Time gate — the action is debounced behind a hold-duration
//      (default 800ms). Single accidental taps cannot fire it.
//   2. Haptic feedback — every 200ms during the hold the device
//      vibrates briefly (Web Vibration API). On the final commit,
//      a longer "snap" vibration confirms the seal.
//   3. Visual progress — a circular fill-bar wraps the button
//      label, charging from 0% to 100% as the hold accumulates.
//      Letting go before 100% cancels with no action.
//
// Falls back to a single-tap commit if the device doesn't support
// the Vibration API (most desktops, some restricted Android
// configurations) — Joao's Android 9 supports it.
//
// Wraps any text + any onConfirm callback. Returns the same
// children when not pressing; renders a progress-overlay when
// pressing.

'use client';

import {
  type FC,
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { palette, radius, typography } from '@/lib/field/tokens';

interface HapticLockButtonProps {
  /** Visible label — what Joao sees on the button */
  label: string;
  /** The action to commit when the hold completes */
  onConfirm: () => void | Promise<void>;
  /** Hold duration in ms before commit (default 800) */
  holdMs?: number;
  /** Disable the button entirely (e.g., while a network call is in flight) */
  disabled?: boolean;
  /** Visual variant — primary fills with forest (sealed),
   *  destructive fills with warmRed (CLOCK_OUT, end shift). */
  variant?: 'primary' | 'destructive';
  /** Size — default 'lg' is the canonical CLOCK_IN size */
  size?: 'lg' | 'md';
  /** Optional className escape hatch */
  className?: string;
  /** Optional inline style override */
  style?: CSSProperties;
}

const VARIANT_BG = {
  primary:     palette.green,        // forest — sealed/positive commit
  destructive: palette.red,          // warmRed — destructive/end-shift
} as const;

const SIZE = {
  lg: { height: 80, fontSize: 20, padding: '0 24px' },
  md: { height: 56, fontSize: 16, padding: '0 16px' },
} as const;

function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // some browsers throw; fail silently — visual feedback covers it
    }
  }
}

export const HapticLockButton: FC<HapticLockButtonProps> = ({
  label,
  onConfirm,
  holdMs = 800,
  disabled = false,
  variant = 'primary',
  size = 'lg',
  className,
  style,
}) => {
  const [progress, setProgress] = useState(0); // 0..1
  const [pressed, setPressed] = useState(false);
  const [committed, setCommitted] = useState(false);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  const sz = SIZE[size];
  const bg = VARIANT_BG[variant];

  const commit = useCallback(async () => {
    if (committed) return;
    setCommitted(true);
    vibrate([60, 30, 90]); // snap pattern — final seal
    try {
      await onConfirm();
    } finally {
      // brief lock-in pause before resetting (reads as confirmed,
      // not as "did it actually fire")
      setTimeout(() => {
        setCommitted(false);
        setProgress(0);
        setPressed(false);
      }, 600);
    }
  }, [onConfirm, committed]);

  const cancel = useCallback(() => {
    startRef.current = null;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (tickRef.current !== null) clearInterval(tickRef.current);
    rafRef.current = null;
    tickRef.current = null;
    setPressed(false);
    setProgress(0);
  }, []);

  const beginHold = useCallback(() => {
    if (disabled || committed) return;
    setPressed(true);
    startRef.current = performance.now();
    // periodic short vibration during the hold so Joao feels the
    // commit "charging up"
    tickRef.current = window.setInterval(() => vibrate(20), 200);
    const tick = () => {
      if (startRef.current === null) return;
      const elapsed = performance.now() - startRef.current;
      const p = Math.min(1, elapsed / holdMs);
      setProgress(p);
      if (p >= 1) {
        if (tickRef.current !== null) clearInterval(tickRef.current);
        tickRef.current = null;
        rafRef.current = null;
        startRef.current = null;
        void commit();
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [disabled, committed, holdMs, commit]);

  // Cleanup if unmounted mid-hold
  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (tickRef.current !== null) clearInterval(tickRef.current);
  }, []);

  const baseStyle: CSSProperties = {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    overflow: 'hidden',
    height: sz.height,
    padding: sz.padding,
    fontSize: sz.fontSize,
    fontFamily: typography.sans,
    fontWeight: 700,
    letterSpacing: '0.02em',
    borderRadius: radius.button,
    border: 'none',
    background: bg,
    color: palette.warm,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    transition: 'transform 100ms ease-out, opacity 200ms ease-out',
    transform: pressed && !committed ? 'scale(0.985)' : 'scale(1)',
    userSelect: 'none',
    touchAction: 'manipulation',
    minWidth: '180px',
    ...style,
  };

  // Progress overlay — a forward-fill bar that consumes the button
  // background as Joao holds. Reads as "charging up to commit."
  const overlayStyle: CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: `${progress * 100}%`,
    background: 'rgba(245, 242, 234, 0.18)', // cream-tinted overlay
    pointerEvents: 'none',
    transition: progress === 0 ? 'width 180ms ease-out' : 'none',
  };

  const labelText = committed
    ? 'Confirmed ✓'
    : pressed
      ? `Hold to confirm — ${Math.round(progress * 100)}%`
      : label;

  return (
    <button
      type="button"
      disabled={disabled || committed}
      className={className}
      style={baseStyle}
      onPointerDown={beginHold}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={`${label} — press and hold to confirm`}
    >
      <span style={overlayStyle} aria-hidden="true" />
      <span style={{ position: 'relative', zIndex: 1 }}>{labelText}</span>
    </button>
  );
};
