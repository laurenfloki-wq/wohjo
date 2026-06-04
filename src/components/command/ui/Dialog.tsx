'use client';

// FLOSTRUCTION /command — Dialog.
// Single design-system modal. Dark scrim + subtle blur, raised surface,
// hairline border, the one permitted shadow. Focus trap, ESC to close,
// click-scrim to close, return-focus to the original trigger, aria roles.
// Reduced-motion aware (transitions are dropped when the OS asks).
//
// Usage:
//   <Dialog open={...} onClose={...} title="..." description="...">
//     <DialogBody>...</DialogBody>
//     <DialogFooter>...</DialogFooter>
//   </Dialog>

import {
  type CSSProperties, type ReactNode,
  useCallback, useEffect, useId, useMemo, useRef, useState,
} from 'react';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Optional eyebrow above the title — sparing, never the literal word COMMAND. */
  eyebrow?: ReactNode;
  /** "sm" (~440px) / "md" (~560px, default) / "lg" (~720px). */
  size?: 'sm' | 'md' | 'lg';
  /** Hide the X close affordance (keep ESC + scrim). */
  hideCloseButton?: boolean;
  /** Provide your own DialogBody + DialogFooter children. */
  children: ReactNode;
  /** Visually hide the title — provided for screen readers only. */
  titleHidden?: boolean;
}

const SIZE_PX: Record<NonNullable<DialogProps['size']>, number> = {
  sm: 440, md: 560, lg: 720,
};

function focusableSelector(): string {
  return [
    'a[href]', 'button:not([disabled])', 'input:not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])', '[contenteditable="true"]',
  ].join(',');
}

export function Dialog({
  open, onClose, title, description, eyebrow, size = 'md',
  hideCloseButton, children, titleHidden,
}: DialogProps) {
  const titleId = useId();
  const descId = useId();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);

  // Remember whatever held focus before open, so we return there on close.
  useEffect(() => {
    if (open) {
      triggerRef.current = (document.activeElement as HTMLElement) ?? null;
      setMounted(true);
    } else if (mounted) {
      const t = triggerRef.current;
      if (t && typeof t.focus === 'function') {
        // Defer so the dialog removal isn't competing for focus.
        requestAnimationFrame(() => t.focus());
      }
      setMounted(false);
    }
  }, [open, mounted]);

  // Move focus into the surface on open + lock body scroll.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const root = surfaceRef.current;
    if (root) {
      const first = root.querySelector<HTMLElement>(focusableSelector());
      (first ?? root).focus({ preventScroll: true });
    }
    return () => { document.body.style.overflow = prevOverflow; };
  }, [open]);

  // ESC + focus trap.
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = surfaceRef.current;
      if (!root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(focusableSelector()))
        .filter((el) => !el.hasAttribute('disabled'));
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [open, onClose],
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onKeyDown]);

  const widthPx = useMemo(() => SIZE_PX[size], [size]);
  const titleStyle: CSSProperties = titleHidden
    ? {
        position: 'absolute', width: 1, height: 1, overflow: 'hidden',
        clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap',
      }
    : {
        // Dialog titles are section titles — Inter sans, semibold.
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--t-lg)',
        fontWeight: 600,
        letterSpacing: '-0.005em',
        margin: 0,
        color: 'var(--ink)',
        lineHeight: 1.25,
      };

  if (!open) return null;

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15, 15, 16, 0.45)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'var(--s-4)',
        animation: 'flos-dialog-fade var(--dur-fast) var(--ease) both',
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={surfaceRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        style={{
          width: '100%',
          maxWidth: widthPx,
          maxHeight: 'calc(100vh - 32px)',
          overflow: 'auto',
          background: 'var(--surface)',
          color: 'var(--ink)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          boxShadow: 'var(--shadow-overlay)',
          padding: 'var(--card-padding)',
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--t-base)',
          animation: 'flos-dialog-rise var(--dur) var(--ease) both',
          outline: 'none',
        }}
      >
        <header style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 'var(--s-4)', marginBottom: description ? 'var(--s-3)' : 'var(--s-4)',
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            {eyebrow ? (
              <div style={{
                fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em',
                color: 'var(--ink-muted)', fontWeight: 500, marginBottom: 6,
              }}>{eyebrow}</div>
            ) : null}
            <h2 id={titleId} style={titleStyle}>{title}</h2>
            {description ? (
              <p id={descId} style={{
                marginTop: 8, color: 'var(--ink-secondary)', fontSize: 'var(--t-sm)',
                lineHeight: 1.55,
              }}>{description}</p>
            ) : null}
          </div>
          {hideCloseButton ? null : (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                background: 'transparent', border: '1px solid var(--border)',
                color: 'var(--ink-secondary)', borderRadius: 'var(--r-md)',
                padding: '6px 8px', minHeight: 36, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={16} strokeWidth={1.7} aria-hidden />
            </button>
          )}
        </header>
        {children}
      </div>
      <style>{`
        @keyframes flos-dialog-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes flos-dialog-rise {
          from { opacity: 0; transform: translateY(8px) scale(0.985); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          [role="dialog"], [role="presentation"] {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}

export function DialogBody({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ marginBottom: 'var(--s-4)', ...style }}>{children}</div>;
}

export function DialogFooter({
  children, style, align = 'right',
}: {
  children: ReactNode; style?: CSSProperties; align?: 'right' | 'left' | 'between';
}) {
  const justify = align === 'between' ? 'space-between' : align === 'left' ? 'flex-start' : 'flex-end';
  return (
    <footer style={{
      display: 'flex', justifyContent: justify, gap: 'var(--s-2)',
      paddingTop: 'var(--s-3)', borderTop: '1px solid var(--border)',
      ...style,
    }}>
      {children}
    </footer>
  );
}
