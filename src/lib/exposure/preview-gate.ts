// Preview gate (P8) — the guard that stops unsigned legal content going live.
//
// Invariant: a DRAFT ruleset MUST run in SIGN-OFF PREVIEW. Equivalently, the
// `preview` prop may only be removed from <ExposureCheck> once the ruleset has
// been promoted out of the `draft` channel (i.e. the founder has signed off the
// compliance values). This pure check is asserted against the live page +
// version in preview-gate.test.ts, which runs under the Unit suite CI gate.

export interface PreviewGateInput {
  /** Is <ExposureCheck> rendered with the `preview` prop? */
  previewOn: boolean;
  /** The active EXPOSURE_RULESET_VERSION. */
  version: string;
}

export interface PreviewGateResult {
  ok: boolean;
  reason?: string;
}

/** Returns ok:false (with a reason) when a DRAFT ruleset is shipped preview-off. */
export function checkPreviewGate({ previewOn, version }: PreviewGateInput): PreviewGateResult {
  const isDraft = version.toLowerCase().includes('draft');
  if (isDraft && !previewOn) {
    return {
      ok: false,
      reason:
        `Ruleset "${version}" is DRAFT but <ExposureCheck> is rendered without the ` +
        `preview prop. The founder must sign off the compliance values and the ruleset ` +
        `must be promoted out of the "draft" channel before preview is removed.`,
    };
  }
  return { ok: true };
}
