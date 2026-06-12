// Automated contrast gate for the warm-light operator surface (dispatch
// 2026-06-12 SS3: "CI must include an automated contrast test against
// this sheet: all text >= 4.5:1"). WCAG 2.1 relative luminance.
import { describe, expect, it } from 'vitest';
import { DECORATIVE_ONLY, PAGE_TOKENS, TEXT_PAIRS } from './page-tokens';

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = channel(parseInt(h.slice(0, 2), 16));
  const g = channel(parseInt(h.slice(2, 4), 16));
  const b = channel(parseInt(h.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

describe('page paradigm token sheet — contrast law', () => {
  it.each(TEXT_PAIRS.map((p) => [p.fg, p.bg, p.usage] as const))(
    '%s on %s (%s) meets 4.5:1',
    (fg, bg) => {
      const ratio = contrastRatio(PAGE_TOKENS[fg], PAGE_TOKENS[bg]);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('pins the exact token values from the 12 June directors decision', () => {
    expect(PAGE_TOKENS.paper).toBe('#F7F4EC');
    expect(PAGE_TOKENS.ink).toBe('#1F1B14');
    expect(PAGE_TOKENS.ink35).toBe('#786D56');
    expect(PAGE_TOKENS.green).toBe('#166534');
    expect(PAGE_TOKENS.red).toBe('#B5402F');
    expect(PAGE_TOKENS.amber).toBe('#D9A548');
  });

  it('amber is decorative only — never a text foreground', () => {
    for (const name of DECORATIVE_ONLY) {
      expect(TEXT_PAIRS.some((p) => p.fg === name)).toBe(false);
    }
  });

  it('ink-35 is the floor — no text token lighter than 4.6:1 on paper', () => {
    expect(contrastRatio(PAGE_TOKENS.ink35, PAGE_TOKENS.paper)).toBeGreaterThanOrEqual(4.6);
  });

  it('red pairs only with paper surfaces and its own wash', () => {
    const redPairs = TEXT_PAIRS.filter((p) => p.fg === 'red');
    for (const p of redPairs) {
      expect(['paper', 'paperRaise', 'redWash']).toContain(p.bg);
    }
  });
});
