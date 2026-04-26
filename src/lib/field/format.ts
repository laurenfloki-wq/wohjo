// Flostruction Field — Formatting helpers
// B5 time format standardisation — 12-hour without leading zero,
// AEST suffix in worker-facing contexts, 24-hour in technical contexts.
// Single source of truth; import everywhere rather than inlining
// toLocaleTimeString() calls with ad-hoc options.

/**
 * Worker-facing 12-hour time with AEST suffix. No leading zero on hour.
 *   formatTimeAEST("2026-04-22T03:34:00Z")   // "3:34pm AEST"
 *   formatTimeAEST("2026-04-22T21:00:00Z")   // "7:00am AEST"
 */
export function formatTimeAEST(iso: string | Date): string {
  try {
    const d = typeof iso === 'string' ? new Date(iso) : iso;
    // Explicit AU locale + Australia/Sydney timezone. Lowercase am/pm
    // matches the brief ("3:34pm" not "3:34 PM").
    const formatted = d
      .toLocaleTimeString('en-AU', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Australia/Sydney',
      })
      .replace(/\s?(am|pm|AM|PM)$/i, (m) => m.trim().toLowerCase());
    return `${formatted} AEST`;
  } catch {
    return '';
  }
}

/**
 * Technical 24-hour format for audit/hash contexts. No suffix.
 */
export function formatTime24(iso: string | Date): string {
  try {
    const d = typeof iso === 'string' ? new Date(iso) : iso;
    return d.toLocaleTimeString('en-AU', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Australia/Sydney',
    });
  } catch {
    return '';
  }
}

/**
 * Worker-facing date: "Wednesday 22 April 2026".
 */
export function formatDateLong(iso: string | Date): string {
  try {
    const d = typeof iso === 'string' ? new Date(iso) : iso;
    return d.toLocaleDateString('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Australia/Sydney',
    });
  } catch {
    return '';
  }
}

/**
 * Compact date for shift lists: "Wed 22 Apr".
 */
export function formatDateShort(iso: string | Date): string {
  try {
    const d = typeof iso === 'string' ? new Date(iso) : iso;
    return d.toLocaleDateString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'Australia/Sydney',
    });
  } catch {
    return '';
  }
}

/**
 * Duration between two ISO times, subtracting break minutes, formatted
 * as "8h 26m". Returns "0h 0m" for zero/negative durations.
 */
export function formatDuration(
  startIso: string,
  endIso: string,
  breakMinutes = 0,
): string {
  try {
    const startMs = new Date(startIso).getTime();
    const endMs = new Date(endIso).getTime();
    const totalMinutes = Math.max(0, (endMs - startMs) / 60_000 - breakMinutes);
    const h = Math.floor(totalMinutes / 60);
    const m = Math.floor(totalMinutes % 60);
    return `${h}h ${m}m`;
  } catch {
    return '0h 0m';
  }
}

/**
 * Decimal hours → "X.XX hrs". Used for verified-hours-this-week tally.
 */
export function formatDecimalHours(hours: number): string {
  return `${hours.toFixed(2)} hrs`;
}
