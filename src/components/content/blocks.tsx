// Reusable answer-engine-friendly content blocks. These are the pieces
// answer engines and featured snippets lift: an extractable short answer,
// a scannable list, and a comparison table. Plus the supporting furniture
// (pull quote, checklist, CTA, related links, sources).

import type { ReactNode } from 'react';

/**
 * Extractable one-paragraph answer placed immediately under the H1. Carries
 * the `answer` class that the Article schema marks `speakable`.
 */
export function ShortAnswer({
  label = 'Short answer',
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className="answer">
      <p className="k">{label}</p>
      <p>{children}</p>
    </div>
  );
}

/** Scannable at-a-glance bullet list. */
export function AtAGlance({
  label = 'At a glance',
  items,
}: {
  label?: string;
  items: ReactNode[];
}) {
  return (
    <div className="glance">
      <p className="k">{label}</p>
      <ul>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export interface ComparisonRow {
  label: ReactNode;
  cells: ReactNode[];
}

/**
 * Capability/comparison table — the structure answer engines quote.
 * `columns` includes the (usually empty) first header. `sealColumn` is the
 * 0-based header index to highlight as the differentiating column.
 */
export function ComparisonTable({
  caption,
  columns,
  rows,
  sealColumn,
}: {
  caption: string;
  columns: string[];
  rows: ComparisonRow[];
  sealColumn?: number;
}) {
  return (
    <table className="cmp">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th key={i} scope="col" className={i === sealColumn ? 'seal-col' : undefined}>
              {c || ' '}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri}>
            <td>{r.label}</td>
            {r.cells.map((cell, ci) => (
              <td key={ci}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Emphasis pull quote. */
export function PullQuote({ children }: { children: ReactNode }) {
  return <p className="pull">{children}</p>;
}

/** Seal-marked checklist. */
export function Checklist({ items }: { items: ReactNode[] }) {
  return (
    <ul className="checklist">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * Conversion block. Defaults to the existing "Book a demo" flow on the
 * homepage (#action); no self-serve signup.
 */
export function Cta({
  heading,
  body,
  href = '/#action',
  label = 'Book a demo',
}: {
  heading: string;
  body: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="cta">
      <h2>{heading}</h2>
      <p>{body}</p>
      <a className="btn" href={href}>
        {label}
      </a>
    </div>
  );
}

export interface RelatedLink {
  href: string;
  label: string;
}

/** Contextual related-links block (internal-linking spine). */
export function Related({ links }: { links: RelatedLink[] }) {
  return (
    <div className="related">
      <p className="k">Related</p>
      {links.map((l) => (
        <a key={l.href} href={l.href}>
          {l.label}
        </a>
      ))}
    </div>
  );
}

/** Citations row. Pass inline text + links as children. */
export function Sources({ children }: { children: ReactNode }) {
  return <p className="src">Sources: {children}</p>;
}
