// Bot 43 — Dependency & security.
//
// Trigger: schedule + push | Runtime: GitHub Actions | Gate: T1 | Model: Haiku
// (triage prose). Scans (Dependabot / CodeQL / Semgrep / Sentry) produce
// findings; the severity banding, gate decision, and dedupe are pure and
// deterministic. Haiku only summarises; it never decides severity.

export const BOT_ID = 'bot-43-dependency-security';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface Finding {
  advisoryId: string;
  cvss: number; // 0.0 - 10.0
  packageName: string;
  fixedIn: string | null;
}

export interface TriagedFinding extends Finding {
  severity: Severity;
  /** Block the merge/release when true (critical/high with a fix available). */
  block: boolean;
}

/** Pure: CVSS -> severity band (CVSS v3 ranges). */
export function severityOf(cvss: number): Severity {
  if (cvss >= 9.0) return 'critical';
  if (cvss >= 7.0) return 'high';
  if (cvss >= 4.0) return 'medium';
  return 'low';
}

/**
 * Pure: triage + dedupe by advisory id (keep highest CVSS per advisory). A
 * finding blocks when it is critical/high AND a fix is available (actionable);
 * unfixable highs are surfaced but do not block the pipeline indefinitely.
 */
export function triage(findings: ReadonlyArray<Finding>): TriagedFinding[] {
  const byId = new Map<string, Finding>();
  for (const f of findings) {
    const existing = byId.get(f.advisoryId);
    if (!existing || f.cvss > existing.cvss) byId.set(f.advisoryId, f);
  }
  return [...byId.values()]
    .map((f) => {
      const severity = severityOf(f.cvss);
      const block = (severity === 'critical' || severity === 'high') && f.fixedIn !== null;
      return { ...f, severity, block };
    })
    .sort((a, b) => b.cvss - a.cvss);
}
