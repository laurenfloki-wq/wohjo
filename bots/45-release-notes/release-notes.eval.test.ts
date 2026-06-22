// Golden evals — bot 45 (release notes). Deterministic categorisation + no emoji.

import { describe, it, expect } from 'vitest';
import { changeKind, categorise, renderChangelog } from './handler';

describe('bot 45 — release notes', () => {
  it('derives conventional-commit kind from titles', () => {
    expect(changeKind('feat(sms): batch reminders')).toBe('feat');
    expect(changeKind('fix: null guard')).toBe('fix');
    expect(changeKind('perf!: faster hash')).toBe('perf');
    expect(changeKind('random title')).toBe('other');
  });

  it('renders a deterministic, emoji-free changelog', () => {
    const md = renderChangelog(
      categorise([
        { number: 1, title: 'feat: add seals' },
        { number: 2, title: 'fix: correct GST' },
        { number: 3, title: 'misc cleanup' },
      ]),
    );
    expect(md).toContain('## Features');
    expect(md).toContain('- feat: add seals (#1)');
    expect(md).toContain('## Fixes');
    expect(md).toContain('## Other');
  });

  it('throws if an emoji sneaks into a PR title', () => {
    expect(() => renderChangelog(categorise([{ number: 9, title: 'feat: ship it 🚀' }]))).toThrow();
  });
});
