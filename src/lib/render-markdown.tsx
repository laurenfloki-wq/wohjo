/**
 * render-markdown.tsx
 * Server Component-compatible markdown → JSX renderer.
 * Handles: H1/H2/H3, bold (**text**), italic (_text_), links ([text](url)),
 * unordered lists (- item), blockquotes (> ...), paragraphs.
 * Strips [VOICE: needs Lauren] annotation blocks entirely.
 */

import type { ReactNode } from 'react';

// ── Inline formatting ────────────────────────────────────────────────────────

function parseInline(text: string, key: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Regex matches bold, italic, links in order
  const pattern = /(\*\*(.+?)\*\*)|(_(.+?)_)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // Bold: **text**
      nodes.push(<strong key={`${key}-b-${match.index}`}>{match[2]}</strong>);
    } else if (match[3]) {
      // Italic: _text_
      nodes.push(<em key={`${key}-i-${match.index}`}>{match[4]}</em>);
    } else if (match[5]) {
      // Link: [text](url)
      nodes.push(
        <a key={`${key}-a-${match.index}`} href={match[7]} style={{ color: 'inherit' }}>
          {match[6]}
        </a>,
      );
    }

    lastIndex = pattern.lastIndex;
  }

  // Remaining text
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

// ── Block-level renderer ─────────────────────────────────────────────────────

export function renderMarkdown(source: string): ReactNode {
  const lines = source.split('\n');
  const elements: ReactNode[] = [];
  let i = 0;
  let keyCounter = 0;

  function nextKey(prefix: string) {
    return `${prefix}-${keyCounter++}`;
  }

  /**
   * Returns true if a line is a VOICE annotation line.
   * These are blockquote lines that start with `> **[VOICE` or are
   * continuation lines of such a blockquote block.
   */
  function isVoiceAnnotationBlock(startLine: number): boolean {
    // The first line of the block must start with "> **[VOICE"
    return lines[startLine].trim().startsWith('> **[VOICE');
  }

  while (i < lines.length) {
    const line = lines[i];

    // ── Skip horizontal rules ───────────────────────────────────────
    if (/^---+$/.test(line.trim())) {
      i++;
      continue;
    }

    // ── Headings ────────────────────────────────────────────────────
    const h3 = line.match(/^### (.+)/);
    if (h3) {
      elements.push(
        <h3 key={nextKey('h3')} style={{ marginTop: '1.4em', marginBottom: '0.4em' }}>
          {parseInline(h3[1], nextKey('h3c'))}
        </h3>,
      );
      i++;
      continue;
    }

    const h2 = line.match(/^## (.+)/);
    if (h2) {
      elements.push(
        <h2 key={nextKey('h2')} style={{ marginTop: '1.6em', marginBottom: '0.5em' }}>
          {parseInline(h2[1], nextKey('h2c'))}
        </h2>,
      );
      i++;
      continue;
    }

    const h1 = line.match(/^# (.+)/);
    if (h1) {
      elements.push(
        <h1 key={nextKey('h1')} style={{ marginTop: '0', marginBottom: '0.6em' }}>
          {parseInline(h1[1], nextKey('h1c'))}
        </h1>,
      );
      i++;
      continue;
    }

    // ── Blockquotes (including VOICE annotation blocks to strip) ────
    if (line.startsWith('> ')) {
      // Collect the entire blockquote block
      const blockLines: string[] = [];
      let j = i;
      while (j < lines.length && (lines[j].startsWith('> ') || lines[j] === '>')) {
        blockLines.push(lines[j]);
        j++;
      }

      // Check if it's a VOICE annotation block (first line starts with > **[VOICE)
      const isVoice = isVoiceAnnotationBlock(i);

      if (!isVoice) {
        // Render as a real blockquote
        const bqContent = blockLines.map((l) => l.replace(/^> ?/, '')).join(' ');
        elements.push(
          <blockquote
            key={nextKey('bq')}
            style={{
              margin: '1em 0',
              paddingLeft: '1em',
              borderLeft: '3px solid #0E1C2F',
              color: '#555',
              fontStyle: 'italic',
            }}
          >
            {parseInline(bqContent, nextKey('bqc'))}
          </blockquote>,
        );
      }
      // Always skip the whole block
      i = j;
      continue;
    }

    // ── Unordered lists ─────────────────────────────────────────────
    if (line.startsWith('- ')) {
      const items: ReactNode[] = [];
      while (i < lines.length && lines[i].startsWith('- ')) {
        const itemText = lines[i].slice(2);
        items.push(
          <li key={nextKey('li')} style={{ marginBottom: '0.3em' }}>
            {parseInline(itemText, nextKey('lic'))}
          </li>,
        );
        i++;
      }
      elements.push(
        <ul key={nextKey('ul')} style={{ paddingLeft: '1.4em', margin: '0.6em 0' }}>
          {items}
        </ul>,
      );
      continue;
    }

    // ── Empty lines — skip ───────────────────────────────────────────
    if (line.trim() === '') {
      i++;
      continue;
    }

    // ── Paragraph ───────────────────────────────────────────────────
    // Collect consecutive non-empty, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('#') &&
      !lines[i].startsWith('- ') &&
      !lines[i].startsWith('> ') &&
      !/^---+$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    if (paraLines.length > 0) {
      const paraText = paraLines.join(' ');
      elements.push(
        <p key={nextKey('p')} style={{ margin: '0 0 0.9em' }}>
          {parseInline(paraText, nextKey('pc'))}
        </p>,
      );
    }
  }

  return <>{elements}</>;
}
