// People page derivations — pure, tested. Lifetime verified hours are
// the relationship number: every sealed hour a worker has ever
// recorded with this company.

export interface ShiftHoursRow {
  worker_id: string | null;
  total_hours: number | string | null;
  status: string;
}

const VERIFIED = new Set(['SUBMITTED', 'APPROVED', 'EXPORTED']);

export function lifetimeHoursByWorker(
  rows: ReadonlyArray<ShiftHoursRow>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (r.worker_id === null || r.total_hours === null || !VERIFIED.has(r.status)) continue;
    out[r.worker_id] = Math.round(((out[r.worker_id] ?? 0) + Number(r.total_hours)) * 100) / 100;
  }
  return out;
}

export function formatHours(n: number): string {
  return n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function sinceLabel(createdAtIso: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    month: 'short',
    year: 'numeric',
  }).format(new Date(createdAtIso));
}
