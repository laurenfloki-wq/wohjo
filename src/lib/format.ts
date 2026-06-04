// FLOSTRUCTION — display formatting utilities for /command.
// Australian English. Tabular figures (numerals are already
// font-feature-settings-bound in the command-light scope).

const AU_LOCALE = 'en-AU';
const DEFAULT_TZ = 'Australia/Sydney';

/**
 * Format a date as "DD MMM YYYY", e.g. "04 Jun 2026".
 * Dispatch-mandated canonical date format for the /command surface.
 */
export function formatDate(value: string | Date | null | undefined, tz: string = DEFAULT_TZ): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.valueOf())) return '—';
  // en-GB happens to render "04 Jun 2026" with day, short month, full year.
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: tz,
  }).format(d);
}

/**
 * Format a time in a given timezone as "HH:MM" (24-hour).
 * Always include the timezone abbreviation when the caller asks for
 * `withZone: true` — this is the dispatch's site-local-time requirement.
 */
export function formatTime(
  value: string | Date | null | undefined,
  tz: string = DEFAULT_TZ,
  withZone = false,
): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.valueOf())) return '—';
  const base = new Intl.DateTimeFormat(AU_LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  }).format(d);
  if (!withZone) return base;
  const tzPart = new Intl.DateTimeFormat(AU_LOCALE, {
    timeZoneName: 'short',
    timeZone: tz,
  })
    .formatToParts(d)
    .find((p) => p.type === 'timeZoneName')?.value ?? '';
  return tzPart ? `${base} ${tzPart}` : base;
}

/** Combined date + time + zone, e.g. "04 Jun 2026 · 07:12 AEST". */
export function formatDateTime(
  value: string | Date | null | undefined,
  tz: string = DEFAULT_TZ,
): string {
  if (!value) return '—';
  return `${formatDate(value, tz)} · ${formatTime(value, tz, true)}`;
}

/**
 * Pluralise a noun against a count. Defaults to the regular `+s` rule.
 * Pass an explicit plural for irregular nouns.
 *
 *   pluralise(1, 'shift') -> '1 shift'
 *   pluralise(2, 'shift') -> '2 shifts'
 *   pluralise(1, 'entry', 'entries') -> '1 entry'
 */
export function pluralise(count: number, singular: string, plural?: string): string {
  const n = Number(count);
  const word = n === 1 ? singular : (plural ?? `${singular}s`);
  return `${formatInt(n)} ${word}`;
}

/** Singular/plural noun helper without the count prefix. */
export function nounFor(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

/**
 * Format hours as "Hh Mm (D.DD h)". The primary form is conversational;
 * the parenthesised decimal serves payroll cross-checks.
 *   3.5 -> "3h 30m (3.50 h)"
 *   5.93333 -> "5h 56m (5.93 h)"
 */
export function formatHours(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return '—';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const decimal = hours.toFixed(2);
  return `${h}h ${m}m (${decimal} h)`;
}

/** Short hours-only form ("5h 56m") for tight spaces. */
export function formatHoursShort(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return '—';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/**
 * Map a confidence score (0–100) to a calm human label.
 * The raw number is intentionally not surfaced anywhere in /command.
 *   >= 80 -> 'Strong'
 *   >= 50 -> 'Adequate'
 *   else  -> 'Review'
 */
export function confidenceLabel(score: number | null | undefined): 'Strong' | 'Adequate' | 'Review' {
  if (score == null || !Number.isFinite(score)) return 'Review';
  if (score >= 80) return 'Strong';
  if (score >= 50) return 'Adequate';
  return 'Review';
}

/** Format an integer with the AU thousands separator. */
export function formatInt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(AU_LOCALE).format(Math.round(n));
}

/** Format a decimal number with the given fraction digits. */
export function formatDecimal(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(AU_LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

/** "5 minutes ago", "3 hours ago", "2 days ago", "just now" — relative & quiet. */
export function relativeTime(value: string | Date | null | undefined, now: Date = new Date()): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.valueOf())) return '—';
  const diffMs = now.valueOf() - d.valueOf();
  const sec = Math.round(diffMs / 1000);
  if (sec < 30) return 'just now';
  if (sec < 60) return `${sec} seconds ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${pluralise(min, 'minute')} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${pluralise(hr, 'hour')} ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${pluralise(day, 'day')} ago`;
  return formatDate(d);
}

/**
 * Map a raw `start_time_source` substrate value to a human, trust-bearing
 * phrase. The dispatch wants provenance to outweigh percentage confidence.
 */
export function startTimeSourceLabel(source: string | null | undefined): string {
  switch (source) {
    case 'geofence':
    case 'geofence_corroborated':
      return 'Geofence-confirmed start';
    case 'worker':
    case 'worker_confirmed':
      return 'Worker-confirmed start';
    case 'system':
    case 'system_estimated':
      return 'System-estimated start';
    default:
      return 'Start time recorded';
  }
}
