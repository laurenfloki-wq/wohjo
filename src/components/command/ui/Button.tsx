// FLOSTRUCTION /command — Button.
// Three variants only. Primary action is ink (the dispatch's choice for
// quiet institutional weight). Secondary is hairline outline. Ghost is
// chromeless. No gradients, no shadows, no neon.

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'md' | 'sm';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

function styleFor(variant: Variant, size: Size, loading: boolean, disabled: boolean | undefined) {
  const inactive = !!disabled || loading;
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    fontFamily: 'var(--font-sans)',
    fontWeight: 500,
    letterSpacing: '0.005em',
    cursor: inactive ? 'not-allowed' : 'pointer',
    transition: 'background var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease), opacity var(--dur-fast) var(--ease)',
    borderRadius: 'var(--r-md)',
    opacity: inactive ? 0.55 : 1,
    border: '1px solid transparent',
    minHeight: size === 'sm' ? 36 : 44,
    padding: size === 'sm' ? '0 12px' : '0 16px',
    fontSize: size === 'sm' ? 'var(--t-sm)' : 'var(--t-base)',
    whiteSpace: 'nowrap' as const,
  };

  if (variant === 'primary') {
    return {
      ...base,
      background: 'var(--primary)',
      color: 'var(--primary-ink)',
      borderColor: 'var(--primary)',
    };
  }
  if (variant === 'secondary') {
    return {
      ...base,
      background: 'var(--surface)',
      color: 'var(--ink)',
      borderColor: 'var(--border-strong)',
    };
  }
  // ghost
  return {
    ...base,
    background: 'transparent',
    color: 'var(--ink-secondary)',
    borderColor: 'transparent',
  };
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  leadingIcon,
  trailingIcon,
  children,
  disabled,
  type = 'button',
  ...rest
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      style={styleFor(variant, size, loading, disabled)}
      data-variant={variant}
      data-loading={loading || undefined}
      {...rest}
    >
      {leadingIcon}
      <span>{loading ? 'Working…' : children}</span>
      {trailingIcon}
    </button>
  );
}
