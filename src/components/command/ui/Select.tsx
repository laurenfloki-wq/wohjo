'use client';

// FLOSTRUCTION /command — Select (custom combobox).
// Replaces native <select> which renders black-on-black against the
// scoped charcoal form surface. WAI-ARIA listbox pattern, keyboard
// navigable (Arrow keys, Home/End, Enter, Esc, type-ahead). Sits on
// --surface, uses --ink + --ink-muted for readable contrast.

import {
  type ReactNode,
  type CSSProperties,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption<T extends string = string> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

interface Props<T extends string = string> {
  value: T;
  onChange: (next: T) => void;
  options: SelectOption<T>[];
  /** Optional accessible label, when there isn't an external <label htmlFor>. */
  ariaLabel?: string;
  /** Label binding — the id of an outer label[for]. */
  labelledBy?: string;
  placeholder?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  /** When set, the menu opens at full button width. */
  fullWidth?: boolean;
  style?: CSSProperties;
}

export function Select<T extends string = string>({
  value,
  onChange,
  options,
  ariaLabel,
  labelledBy,
  placeholder = 'Select…',
  disabled,
  size = 'md',
  fullWidth = true,
  style,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(() =>
    Math.max(
      0,
      options.findIndex((o) => o.value === value),
    ),
  );
  const listId = useId();
  const optionIds = useMemo(() => options.map((_, i) => `${listId}-opt-${i}`), [listId, options]);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const typeBufRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });

  const selected = options.find((o) => o.value === value) ?? null;

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocPointer);
    return () => document.removeEventListener('mousedown', onDocPointer);
  }, [open]);

  // Scroll the active option into view as we navigate.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `#${CSS.escape(optionIds[activeIndex] ?? '')}`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, optionIds]);

  const commit = useCallback(
    (idx: number) => {
      const opt = options[idx];
      if (!opt || opt.disabled) return;
      onChange(opt.value);
      setOpen(false);
      requestAnimationFrame(() => btnRef.current?.focus());
    },
    [onChange, options],
  );

  const onButtonKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setOpen(true);
        setActiveIndex(options.length - 1);
      }
    },
    [options.length],
  );

  const onListKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLUListElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        btnRef.current?.focus();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        commit(activeIndex);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(options.length - 1, i + 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        setActiveIndex(0);
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        setActiveIndex(options.length - 1);
        return;
      }
      if (e.key === 'Tab') {
        setOpen(false);
        return;
      }

      // Type-ahead — accumulate until 500ms gap.
      if (e.key.length === 1) {
        const now = Date.now();
        const buf = typeBufRef.current;
        const text = (now - buf.at < 500 ? buf.text : '') + e.key.toLowerCase();
        typeBufRef.current = { text, at: now };
        const hit = options.findIndex(
          (o) => typeof o.label === 'string' && o.label.toLowerCase().startsWith(text),
        );
        if (hit >= 0) setActiveIndex(hit);
      }
    },
    [activeIndex, commit, options],
  );

  const trigger: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    width: fullWidth ? '100%' : undefined,
    minHeight: size === 'sm' ? 36 : 44,
    padding: size === 'sm' ? '0 10px 0 12px' : '0 12px 0 14px',
    background: 'var(--surface)',
    color: selected ? 'var(--ink)' : 'var(--ink-muted)',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--r-md)',
    fontFamily: 'var(--font-sans)',
    fontSize: size === 'sm' ? 'var(--t-sm)' : 'var(--t-base)',
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'border-color var(--dur-fast) var(--ease)',
    opacity: disabled ? 0.55 : 1,
    ...style,
  };

  return (
    <div style={{ position: 'relative', display: fullWidth ? 'block' : 'inline-block' }}>
      <button
        ref={btnRef}
        type="button"
        role="combobox"
        aria-controls={listId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onButtonKeyDown}
        style={trigger}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={16}
          strokeWidth={1.7}
          style={{
            color: 'var(--ink-muted)',
            transition: 'transform var(--dur-fast) var(--ease)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
          aria-hidden
        />
      </button>
      {open ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={optionIds[activeIndex]}
          onKeyDown={onListKeyDown}
          style={{
            position: 'absolute',
            left: 0,
            right: fullWidth ? 0 : undefined,
            top: 'calc(100% + 4px)',
            background: 'var(--surface)',
            color: 'var(--ink)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
            boxShadow: 'var(--shadow-overlay)',
            margin: 0,
            padding: 4,
            maxHeight: 280,
            overflowY: 'auto',
            overflowX: 'hidden',
            listStyle: 'none',
            zIndex: 1100,
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--t-base)',
          }}
          onFocus={(e) => {
            // Some browsers focus the UL itself — bounce.
            if (e.target === e.currentTarget) e.currentTarget.focus({ preventScroll: true });
          }}
        >
          {options.map((opt, i) => {
            const isActive = i === activeIndex;
            const isSelected = opt.value === value;
            return (
              <li
                key={opt.value}
                id={optionIds[i]}
                role="option"
                aria-selected={isSelected}
                aria-disabled={opt.disabled || undefined}
                onMouseEnter={() => !opt.disabled && setActiveIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(i);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 'var(--r-sm)',
                  cursor: opt.disabled ? 'not-allowed' : 'pointer',
                  background: isActive ? 'var(--surface-sunken)' : 'transparent',
                  color: 'var(--ink)',
                  opacity: opt.disabled ? 0.5 : 1,
                  transition: 'background var(--dur-fast) var(--ease)',
                }}
              >
                <Check
                  size={14}
                  strokeWidth={2}
                  style={{
                    marginTop: 3,
                    opacity: isSelected ? 1 : 0,
                    color: 'var(--verified)',
                    flexShrink: 0,
                  }}
                  aria-hidden
                />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', color: 'var(--ink)' }}>{opt.label}</span>
                  {opt.description ? (
                    <span
                      style={{
                        display: 'block',
                        color: 'var(--ink-muted)',
                        fontSize: 'var(--t-xs)',
                        marginTop: 2,
                      }}
                    >
                      {opt.description}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
