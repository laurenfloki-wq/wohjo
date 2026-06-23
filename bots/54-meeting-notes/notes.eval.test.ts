import { describe, it, expect } from 'vitest';
import { extractActions, extractDecisions } from './handler';
describe('bot 54 — meeting notes', () => {
  it('extracts action items with owners', () => {
    const a = extractActions([
      'Discussion of roadmap',
      'ACTION: @lauren ship the quote bot',
      'TODO: review BAS',
    ]);
    expect(a).toHaveLength(2);
    expect(a[0]).toEqual({ owner: 'lauren', task: 'ship the quote bot' });
    expect(a[1]?.owner).toBeNull();
  });
  it('extracts decisions', () => {
    const d = extractDecisions(['Decision: adopt v1.0 pricing', 'random line']);
    expect(d).toEqual([{ text: 'adopt v1.0 pricing' }]);
  });
});
