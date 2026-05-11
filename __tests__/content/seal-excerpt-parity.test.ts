/**
 * DEV-3 / CRACK 222 — drift guard.
 *
 * The receipt-page SealExpandable component renders an excerpt of
 * what-is-the-seal.md ABOVE the "Read the full explanation →" link. If
 * the source markdown changes but the EXCERPT constant doesn't, the
 * receipt-page preview and the /field/seal full page disagree about
 * what a sealed shift means — exactly the worker-trust failure mode the
 * dispatch flagged.
 *
 * This test re-runs the same first-paragraph extraction the parser uses
 * and asserts the hardcoded EXCERPT in SealExpandable matches verbatim.
 * If you edit what-is-the-seal.md's first paragraph, this test fails
 * and you must mirror the edit in SealExpandable.tsx (or remove the
 * hardcoded constant entirely if a server-component rewrite lands).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractFirstParagraph } from '@/lib/content/parse-sections';

describe('SealExpandable EXCERPT parity with what-is-the-seal.md (DEV-3)', () => {
  it('hardcoded EXCERPT matches the first paragraph of the markdown source', () => {
    const markdown = readFileSync(
      join(process.cwd(), 'src/content/worker/what-is-the-seal.md'),
      'utf-8',
    );
    const fromMarkdown = extractFirstParagraph(markdown);

    const component = readFileSync(
      join(process.cwd(), 'src/components/field/SealExpandable.tsx'),
      'utf-8',
    );

    // Pull the EXCERPT string-literal contents out of the component source.
    // The component declares `const EXCERPT = 'foo' + 'bar' + 'baz';`. We
    // concatenate all single- and double-quoted string literals on the
    // EXCERPT lines until the terminating semicolon.
    const m = component.match(/const\s+EXCERPT\s*=\s*([\s\S]+?);/);
    if (!m) {
      throw new Error('Could not locate EXCERPT constant in SealExpandable.tsx');
    }
    const literalBlock = m[1];
    const parts = literalBlock.match(/(['"])((?:\\.|(?!\1).)*)\1/g) ?? [];
    const fromComponent = parts
      .map((s) => s.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"'))
      .join('');

    expect(fromComponent).toBe(fromMarkdown);
  });
});
