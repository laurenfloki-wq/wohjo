// Golden evals — bot 24 (knowledge base). Deterministic chunking.

import { describe, it, expect } from 'vitest';
import { chunkText } from './handler';

describe('bot 24 — knowledge base', () => {
  it('keeps small articles as a single chunk', () => {
    const chunks = chunkText('Para one.\n\nPara two.', 1000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toContain('Para one.');
    expect(chunks[0]?.content).toContain('Para two.');
  });

  it('splits on paragraph boundaries within the limit', () => {
    const a = 'a'.repeat(600);
    const b = 'b'.repeat(600);
    const chunks = chunkText(`${a}\n\n${b}`, 1000);
    expect(chunks).toHaveLength(2);
    expect(chunks.every((c) => c.content.length <= 1000)).toBe(true);
  });

  it('hard-splits an oversized paragraph', () => {
    const chunks = chunkText('x'.repeat(2500), 1000);
    expect(chunks).toHaveLength(3);
    expect(chunks.every((c) => c.content.length <= 1000)).toBe(true);
    expect(chunks.map((c) => c.index)).toEqual([0, 1, 2]);
  });
});
