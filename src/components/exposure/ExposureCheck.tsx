// Exposure Check — the interactive island (client). Orchestrates the
// ungated, multi-step flow: intro → one question per screen → instant
// per-vector result (Exposure Ledger) → gated lead capture.
//
// All answer state is client-side until the result. Step gating is dynamic:
// the licensing question only appears when the firm supplies into a scheme
// state, so an NSW-only operator is never asked about a licence it can't hold.
//
// Slice (a): scores client-side from the config for the live preview, and the
// lead submit is a stub. Slice (b) moves scoring server-side; slice (c) wires
// the lead submit to the validated /api/exposure endpoint. The `preview` flag
// shows an honest banner that weights + capture are DRAFT pending sign-off.

'use client';

import { useMemo, useState } from 'react';
import './exposure.css';
import '@/styles/command-tokens.css';
import { Button } from '@/components/command/ui/Button';
import { RULES } from '@/lib/exposure/rules.config';
import { scoreExposure } from '@/lib/exposure/score';
import { LICENCE_STATES } from '@/lib/seo/labour-hire-licence';
import type { Answers, Question } from '@/lib/exposure/types';
import { QuestionScreen, type Option } from './QuestionScreen';
import { ExposureLedger } from './ExposureLedger';
import { LeadGate, type LeadInput, type LeadSubmitResult } from './LeadGate';
import { trackExposure } from './analytics';

type Phase = 'intro' | 'questions' | 'result';

const STATE_OPTIONS: Option[] = LICENCE_STATES.map((s) => ({ value: s.slug, label: s.state }));

function answered(q: Question, value: Answers[string]): boolean {
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

  // Visible questions, recomputed as answers change (gating is declarative).
  const visible = useMemo(
    () =>
      RULES.questions.filter((q) => {
        if (q.appliesWhen?.anyOperatingStateHasScheme && !hasSchemeState(answers)) return false;
        return true;
      }),
    [answers],
  );

  const clampedIndex = Math.min(index, visible.length - 1);
  const current = visible[clampedIndex];
  const result = useMemo(
    () => (phase === 'result' ? scoreExposure(answers) : null),
    [phase, answers],
  );

  function start() {
    setPhase('questions');
    setIndex(0);
    trackExposure('exposure_check_started');
  }

  function setAnswer(value: string | string[]) {
    setAnswers((prev) => ({ ...prev, [current.id]: value }));
  }

  function next() {
    trackExposure('exposure_check_step', { step: clampedIndex + 1, question: current.id });
    if (clampedIndex >= visible.length - 1) {
      setPhase('result');
      const r = scoreExposure(answers);
      trackExposure('exposure_check_completed', {
        overall: r.overall,
        biggest_gap: r.biggestGap ?? 'none',
      });
      trackExposure('exposure_result_viewed');
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

  // Injected lead submit. Stubbed in preview; real endpoint lands in slice c.
  async function submitLead(lead: LeadInput): Promise<LeadSubmitResult> {
    if (preview) {
      return { ok: true };
    }
    // Slice c: POST to the validated, rate-limited, persist-first endpoint.
    const res = await fetch('/api/exposure/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...lead, answers, version: RULES.version }),
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
            sign-off · lead capture not yet wired
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
