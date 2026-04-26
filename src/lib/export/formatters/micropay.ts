// ─── Architecture D — strategic intent (last reviewed 2026-04-25) ────
// This file is a TRANSITIONAL CSV format adapter for the bookkeeper-
// mediated workflow. It is NOT a payroll-system integration.
//
// FLOSTRUCTION's architectural endpoint is a public API substrate
// (Phase 2; target end of 2026 / H1 2027). Under that direction,
// payroll vendors integrate WITH FLOSTRUCTION via the public API.
// FLOSMOSIS does NOT build payroll-system-specific integrations.
//
// These formatters exist so that today's customer (Mo and the
// founding cohort) can hand a CSV to their bookkeeper while the
// public API matures. They retire as soon as payroll vendors ship
// their FLOSTRUCTION integrations.
//
// FUTURE ENGINEERS: do NOT extend these into payroll-system API
// integrations. If a customer asks for deeper integration, the
// answer is "we publish our records via the public API; your
// payroll provider can read them". File the customer request in
// the public API backlog instead of writing more code here.
//
// Reference: bulletproofing-sprint-readiness-report-2026-04-25.md
// ──────────────────────────────────────────────────────────────────────

// Flostruction Export — Micropay Formatter (Stub)
// TODO: Implement Micropay timesheet import format
// Adding this provider = implement validate() and format() below.

import type { ApprovedShift, ExportFormatter, ValidationError } from '../types';

export const MicropayFormatter: ExportFormatter = {
  providerId: 'micropay',
  providerName: 'Micropay',
  fileExtension: 'csv',
  mimeType: 'text/csv',

  validate(_shifts: ApprovedShift[]): ValidationError[] {
    // TODO: Implement Micropay-specific validation
    throw new Error('MicropayFormatter not yet implemented — Phase 2');
  },

  format(_shifts: ApprovedShift[]): string {
    // TODO: Implement Micropay timesheet CSV format
    throw new Error('MicropayFormatter not yet implemented — Phase 2');
  },
};
