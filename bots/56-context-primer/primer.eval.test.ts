import { describe, it, expect } from 'vitest';
import { diffPack, hasChanges } from './handler';
describe('bot 56 — context primer', () => {
  it('detects added, removed, changed sections', () => {
    const prev = new Map([
      ['a', 'h1'],
      ['b', 'h2'],
    ]);
    const cur = new Map([
      ['a', 'h1'],
      ['b', 'h2x'],
      ['c', 'h3'],
    ]);
    const d = diffPack(prev, cur);
    expect(d.added).toEqual(['c']);
    expect(d.changed).toEqual(['b']);
    expect(d.removed).toEqual([]);
    expect(hasChanges(d)).toBe(true);
  });
  it('reports no changes for identical packs', () => {
    const p = new Map([['a', 'h1']]);
    expect(hasChanges(diffPack(p, new Map([['a', 'h1']])))).toBe(false);
  });
});
