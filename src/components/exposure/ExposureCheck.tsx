// Exposure Check — the interactive island (client). Orchestrates the
// ungated, multi-step flow: intro → one question per screen → server-scored
// per-vector result (Exposure Ledger) → gated lead capture.
//
// All answer state is client-side until the result. Step gating is dynamic:
// the licensing question only appears when the firm supplies into a scheme
// state, so an NSW-only operator is never asked about a licence it can't hold.
//
// Scoring runs SERVER-SIDE (/api/exposure/score): the client imports only the
// question presentation (questions.ts), never the weights. Lead capture POSTs
// to /api/exposure/lead (persist-first). In the sign-off preview the lead
// submit is stubbed and a banner notes the DRAFT status; scoring is still real.

'use client';

import { useMemo, useState } from 'react';
import './exposure.css';
import '@/styles/command-tokens.css';
import { Button } from '@/components/command/ui/Button';
import { PUBLIC_QUESTIONS, EXPOSURE_RULESET_VERSION } from '@/lib/exposure/questions';
import { LICENCE_STATES } from '@/lib/seo/labour-hire-licence';
import type { Answers, PublicQuestion, PublicExposureResult } from '@/lib/exposure/types';
import { QuestionScreen, type Option } from './QuestionScreen';
import { ExposureLedger } from './ExposureLedger';
import { LeadGate, type LeadInput, type LeadSubmitResult } from './LeadGate';
import { trackExposure } from './analytics';

type Phase = 'intro' | 'questions' | 'scoring' | 'result' | 'error';

const STATE_OPTIONS: Option[] = LICENCE_STATES.map((s) => ({ value: s.slug, label: s.state }));

function answered(q: PublicQuestion, value: Answers[string]): boolean {
  if (q.kind === 'states' || q.kind === 'multi') return Array.isArray(value) && value.length > 0;
  return typeof value === 'string' && value.length > 0;
}

/** Does any selected state run a mandatory scheme? (drives dynamic gating) */
function hasSchemeState(answers: Answers): boolean {
  const states = answers['states'];
  const slugs = Array.isArray(states) ? states : [];
  return slugs.some((slug) => LICENCE_STATES.find((s) => s.slug === slug)?.hasScheme);
}

export function ExposureCheck({ preview = false }: { preview?: boolean }) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [answers, setAnswers] = useState<Answers>({});
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<PublicExposureResult | null>(null);

  // Visible questions, recomputed as answers change (gating is declarative).
  const visible = useMemo(
    () =>
      PUBLIC_QUESTIONS.filter((q) => {
        if (q.appliesWhen?.anyOperatingStateHasScheme && !hasSchemeState(answers)) return false;
        return true;
      }),
    [answers],
  );

  const clampedIndex = Math.min(index, visible.length - 1);
  const current = visible[clampedIndex];

  function start() {
    setPhase('questions');
    setIndex(0);
    trackExposure('exposure_check_started');
  }

  function setAnswer(value: string | string[]) {
    setAnswers((prev) => ({ ...prev, [current.id]: value }));
  }

  async function finish() {
    setPhase('scoring');
    try {
      const res = await fetch('/api/exposure/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) throw new Error(`score failed: ${res.status}`);
      const data = (await res.json()) as { result: PublicExposureResult };
      setResult(data.result);
      setPhase('result');
      trackExposure('exposure_check_completed', {
        overall: data.result.overall,
        biggest_gap: data.result.biggestGap ?? 'none',
      });
      trackExposure('exposure_result_viewed');
    } catch {
      setPhase('error');
    }
  }

  function next() {
    trackExposure('exposure_check_step', { step: clampedIndex + 1, question: current.id });
    if (clampedIndex >= visible.length - 1) {
      void finish();
      return;
    }
    setIndex(clampedIndex + 1);
  }

  function back() {
    if (clampedIndex === 0) {
      setPhase('intro');
      return;
    }
    setIndex(clampedIndex - 1);
  }

  // Injected lead submit. Stubbed in preview; real endpoint otherwise (slice c).
  async function submitLead(lead: LeadInput): Promise<LeadSubmitResult> {
    if (preview) return { ok: true };
    const res = await fetch('/api/exposure/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...lead, answers, version: EXPOSURE_RULESET_VERSION }),
    });
    if (!res.ok) return { ok: false, error: 'Could not send your report. Please try again.' };
    return { ok: true };
  }

  return (
    <div className="command-light">
      <section className="exposure" aria-label="Labour Hire Exposure Check">
        {preview ? (
          <p
            className="exposure-ledger-meta"
            style={{
              marginBottom: 'var(--s-4)',
              padding: 'var(--s-2) var(--s-3)',
              borderRadius: 'var(--r-sm)',
              background: 'var(--review-bg)',
              color: 'var(--review)',
              border: '1px solid var(--review-border)',
            }}
          >
            SIGN-OFF PREVIEW · scoring weights and compliance values are DRAFT, pending founder
            sign-off · lead capture is stubbed in preview
          </p>
        ) : null}

        {phase === 'intro' ? (
          <div className="exposure-animate">
            <p className="exposure-eyebrow">Free · about 2 minutes · no sign-up to start</p>
            <h2 className="exposure-headline">Are you exposed?</h2>
            <p className="exposure-headline-sub">
              A short, plain-English self-assessment of where a labour hire firm carries risk —
              Payday Super, licensing, records, Fair Work and chain-of-responsibility. You&apos;ll
              see your result on screen, free, before anyone asks for your details.
            </p>
            <Button onClick={start}>Start the check</Button>
            <p className="exposure-disclaimer-inline">
              Indicative self-assessment only. General information, not legal advice — no
              solicitor–client relationship is formed. See the full disclaimer below.
            </p>
          </div>
        ) : null}

        {phase === 'questions' && current ? (
          <>
            <div className="exposure-progress" aria-hidden="true">
              <span className="exposure-progress-step">
                Step {clampedIndex + 1} of {visible.length}
              </span>
              <span className="exposure-progress-track">
                {visible.map((q, i) => (
                  <span
                    key={q.id}
                    className="exposure-progress-seg"
                    data-done={i <= clampedIndex}
                  />
                ))}
              </span>
            </div>

            <QuestionScreen
              question={current}
              stateOptions={STATE_OPTIONS}
              value={answers[current.id]}
              onChange={setAnswer}
              stepLabel={`Step ${clampedIndex + 1} of ${visible.length}`}
            />

            <div className="exposure-nav">
              <Button variant="ghost" onClick={back}>
                Back
              </Button>
              <Button onClick={next} disabled={!answered(current, answers[current.id])}>
                {clampedIndex >= visible.length - 1 ? 'See my result' : 'Continue'}
              </Button>
            </div>
          </>
        ) : null}

        {phase === 'scoring' ? (
          <div className="exposure-animate" aria-live="polite">
            <p className="exposure-eyebrow">Working…</p>
            <p className="exposure-headline-sub">Scoring your answers against the current rules.</p>
          </div>
        ) : null}

        {phase === 'error' ? (
          <div className="exposure-animate" role="alert">
            <h2 className="exposure-headline">We couldn’t score that just now.</h2>
            <p className="exposure-headline-sub">
              Your answers are still here — give it another go.
            </p>
            <Button onClick={() => void finish()}>Try again</Button>
          </div>
        ) : null}

        {phase === 'result' && result ? (
          <>
            <ExposureLedger result={result} />
            <LeadGate
              submit={submitLead}
              onStarted={() => trackExposure('exposure_lead_started')}
              onCaptured={() => trackExposure('exposure_lead_captured')}
            />
          </>
        ) : null}
      </section>
    </div>
  );
}

export default ExposureCheck;
