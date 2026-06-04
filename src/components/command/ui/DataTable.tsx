// FLOSTRUCTION /command — DataTable.
// Hairline rows, hover, tabular figures, em-dash empties, sticky header.
// Generic across rows; render-cell is a function so callers don't reach
// for raw <td>s and slip past the design system.

import type { ReactNode } from 'react';

export interface DataTableColumn<Row> {
  id: string;
  header: ReactNode;
  /** Right-align numeric columns; default is left. */
  align?: 'left' | 'right' | 'center';
  /** Mono font for IDs/hashes/tokens. */
  mono?: boolean;
  /** Pixel width (caller knows what fits). */
  width?: number | string;
  render: (row: Row, index: number) => ReactNode;
}

interface Props<Row> {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row, index: number) => string;
  /** Shown when rows.length === 0. */
  empty?: ReactNode;
  /** Optional onClick per row (cursor: pointer, hover lift). */
  onRowClick?: (row: Row) => void;
  /** A caption for accessibility — visually hidden. */
  caption?: string;
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  empty,
  onRowClick,
  caption,
}: Props<Row>) {
  return (
    <div
      style={{
        overflowX: 'auto',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        background: 'var(--surface)',
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'separate',
          borderSpacing: 0,
          fontSize: 'var(--t-base)',
          fontVariantNumeric: 'tabular-nums lining-nums',
        }}
      >
        {caption ? (
          <caption style={{
            position: 'absolute', width: 1, height: 1,
            padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)',
            border: 0,
          }}>{caption}</caption>
        ) : null}
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.id}
                scope="col"
                style={{
                  position: 'sticky',
                  top: 0,
                  textAlign: c.align ?? 'left',
                  background: 'var(--surface-sunken)',
                  color: 'var(--ink-muted)',
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border)',
                  width: c.width,
                }}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                style={{
                  padding: 'var(--s-7)',
                  textAlign: 'center',
                  color: 'var(--ink-muted)',
                }}
              >
                {empty ?? <span>— No records</span>}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={{
                  cursor: onRowClick ? 'pointer' : 'default',
                  transition: 'background var(--dur-fast) var(--ease)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface-sunken)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLTableRowElement).style.background = 'transparent';
                }}
              >
                {columns.map((c) => (
                  <td
                    key={c.id}
                    style={{
                      textAlign: c.align ?? 'left',
                      padding: '14px 16px',
                      borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                      color: 'var(--ink)',
                      fontFamily: c.mono ? 'var(--font-mono)' : 'inherit',
                      verticalAlign: 'middle',
                      width: c.width,
                    }}
                  >
                    {c.render(row, i) ?? <span style={{ color: 'var(--ink-muted)' }}>—</span>}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
