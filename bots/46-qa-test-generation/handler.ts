// Bot 46 — QA/test generation.
//
// Trigger: new code path (PR) | Runtime: GitHub Actions | Gate: T2 merge |
// Model: Sonnet (draft tests). The detection of which changed files are source
// paths lacking adjacent tests is pure and deterministic; Sonnet drafts the
// tests, which compile and run before the (T2-gated) merge.

export const BOT_ID = 'bot-46-qa-test-generation';

export interface ChangedFile {
  path: string;
  status: 'added' | 'modified' | 'removed';
}

const TEST_RE = /\.(test|spec)\.[cm]?tsx?$/;
const SOURCE_RE = /\.[cm]?tsx?$/;

/** True if a path is a test file. */
export function isTestFile(path: string): boolean {
  return TEST_RE.test(path);
}

/** True if a path is a TypeScript/TSX source file (not a test). */
export function isSourceFile(path: string): boolean {
  return SOURCE_RE.test(path) && !isTestFile(path);
}

/**
 * Pure: given the changed files in a PR, return the source files that gained or
 * changed code but have no adjacent test file in the same changeset. These are
 * the paths Sonnet should draft tests for.
 */
export function filesNeedingTests(changed: ReadonlyArray<ChangedFile>): string[] {
  const testedBases = new Set<string>();
  for (const f of changed) {
    if (isTestFile(f.path)) {
      // foo.test.ts -> foo  ;  foo.spec.tsx -> foo
      testedBases.add(f.path.replace(TEST_RE, '').replace(/\.$/, ''));
    }
  }
  const out: string[] = [];
  for (const f of changed) {
    if (f.status === 'removed') continue;
    if (!isSourceFile(f.path)) continue;
    const base = f.path.replace(SOURCE_RE, '');
    if (!testedBases.has(base)) out.push(f.path);
  }
  return out;
}
