// Privacy-safe funnel instrumentation for the Exposure Check (§10).
//
// Uses the repo's existing analytics (@vercel/analytics). NO PII is ever sent:
// no name, email, company, phone, or free-text answer values — only the
// funnel step, the question id, and coarse non-identifying result shape
// (overall band, biggest-gap vector id). All values here are enums/ids that
// already appear in the public config, never user input.

'use client';

import { track } from '@vercel/analytics';

export type ExposureEvent =
  | 'exposure_check_started'
  | 'exposure_check_step'
  | 'exposure_check_completed'
  | 'exposure_result_viewed'
  | 'exposure_lead_started'
  | 'exposure_lead_captured';

type SafeProps = Record<string, string | number | boolean>;

/**
 * Emit a funnel event. Fails silently if analytics isn't available (e.g.
 * SSR, blocked, or local dev) — instrumentation must never break the flow.
 */
export function trackExposure(event: ExposureEvent, props: SafeProps = {}): void {
  try {
    track(event, props);
  } catch {
    // no-op: analytics is best-effort and must not affect the user.
  }
}
