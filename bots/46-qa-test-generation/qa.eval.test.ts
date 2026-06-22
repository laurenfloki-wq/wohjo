// Golden evals — bot 46 (QA/test generation). Deterministic gap detection.

import { describe, it, expect } from 'vitest';
import { isTestFile, isSourceFile, filesNeedingTests } from './handler';

describe('bot 46 — QA/test generation', () => {
  it('classifies test vs source files', () => {
    expect(isTestFile('a/b.test.ts')).toBe(true);
    expect(isTestFile('a/b.spec.tsx')).toBe(true);
    expect(isSourceFile('a/b.ts')).toBe(true);
    expect(isSourceFile('a/b.test.ts')).toBe(false);
    expect(isSourceFile('a/b.css')).toBe(false);
  });

  it('flags changed source files without an adjacent test in the changeset', () => {
    const need = filesNeedingTests([
      { path: 'src/a.ts', status: 'added' }, // no test -> needs
      { path: 'src/b.ts', status: 'modified' },
      { path: 'src/b.test.ts', status: 'added' }, // b is covered
      { path: 'src/c.ts', status: 'removed' }, // removed -> ignored
    ]);
    expect(need).toEqual(['src/a.ts']);
  });
});
