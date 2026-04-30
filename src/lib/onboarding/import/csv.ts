// Minimal RFC-4180-conforming CSV parser.
//
// Substrate-DD note: papaparse is not in package.json; rather than
// pulling a new dependency for the bulk-import substrate, we ship a
// small parser that handles the cases real-world payroll exports
// produce: commas, double-quoted fields, doubled-double-quote escapes
// inside quoted fields, CRLF and LF line endings, BOM, and trailing
// whitespace. We do NOT support: multi-character delimiters,
// header-less files, in-field newlines outside quotes (those would
// be malformed per RFC 4180 anyway).

/**
 * Parse a CSV string into rows of fields. Returns a 2D array; the
 * first row is the header and is not split out.
 *
 * Throws on malformed quoted fields (unterminated quote at EOF).
 */
export function parseCsv(input: string): string[][] {
  if (input.length === 0) return [];

  // Strip UTF-8 BOM if present
  let s = input;
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < s.length) {
    const c = s[i];

    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          // Escaped double-quote inside quoted field
          field += '"';
          i += 2;
          continue;
        }
        // End of quoted field
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    if (c === '"') {
      // Quoted-field opener — only valid at start of field
      if (field.length !== 0) {
        // Treat stray quote as literal in unquoted field
        field += c;
        i++;
        continue;
      }
      inQuotes = true;
      i++;
      continue;
    }

    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }

    if (c === '\r') {
      // CRLF — consume both
      if (s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }

    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }

    field += c;
    i++;
  }

  if (inQuotes) {
    throw new Error('parseCsv: unterminated quoted field at end of input');
  }

  // Final field / row (unless input ends with a clean newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/**
 * Build a header→column-index map from the first parsed row.
 * Header matching is case-insensitive and trims whitespace, since real
 * provider exports drift on casing.
 */
export function headerIndex(headerRow: string[]): Map<string, number> {
  const m = new Map<string, number>();
  headerRow.forEach((h, i) => {
    const k = h.trim().toLowerCase();
    if (k.length > 0) m.set(k, i);
  });
  return m;
}

/**
 * Look up a value from a parsed data row using a case-insensitive
 * header alias list. Returns the first non-empty match, or null.
 *
 * Each provider has known column-name variants (e.g. Xero spells it
 * "Mobile Number" but some exports use "Mobile"). The aliases array
 * captures those at the parser layer.
 */
export function pick(
  row: string[],
  headers: Map<string, number>,
  aliases: string[],
): string | null {
  for (const alias of aliases) {
    const idx = headers.get(alias.trim().toLowerCase());
    if (idx === undefined) continue;
    const v = row[idx];
    if (v === undefined) continue;
    const trimmed = v.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}
