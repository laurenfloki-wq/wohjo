// Bot 24 — Knowledge base.
//
// Trigger: resolved-ticket event | Runtime: EF + pgmq | Gate: T1 | Model:
// Sonnet (draft article). Sonnet drafts the article; the deterministic part —
// chunking for embedding — is here and tested. Chunks feed bot_kb_chunks
// (pgvector) so support (bot 23) can retrieve them.

import { KB } from '../config';

export const BOT_ID = 'bot-24-knowledge-base';

export interface KbChunk {
  index: number;
  content: string;
}

export interface IndexedChunk extends KbChunk {
  sourceId: string;
}

/**
 * Pure: split text into chunks of at most `maxChars`, preferring paragraph
 * boundaries (blank lines) and never exceeding the limit. Deterministic so the
 * same article always chunks identically (stable embeddings / dedupe).
 */
export function chunkText(text: string, maxChars = 1000): KbChunk[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];
  let current = '';
  for (const p of paragraphs) {
    if (p.length > maxChars) {
      // Hard-split an oversized paragraph.
      if (current) {
        chunks.push(current);
        current = '';
      }
      for (let i = 0; i < p.length; i += maxChars) chunks.push(p.slice(i, i + maxChars));
      continue;
    }
    if (current.length + p.length + 2 > maxChars) {
      chunks.push(current);
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current) chunks.push(current);

  // Quality gate: drop thin/junk chunks so retrieval stays clean (config).
  return chunks
    .filter((content) => content.trim().length >= KB.minChunkChars)
    .map((content, index) => ({ index, content }));
}

/**
 * Chunk an article for indexing into bot_kb_chunks, attributing each chunk to
 * its source so retrieved answers can cite it (bot 23 grounding depends on this).
 */
export function chunkArticle(sourceId: string, text: string, maxChars = 1000): IndexedChunk[] {
  return chunkText(text, maxChars).map((c) => ({ ...c, sourceId }));
}
