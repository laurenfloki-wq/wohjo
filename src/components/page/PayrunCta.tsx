// Pay-run call-to-action — the always-actionable end of the pay-run card.
// One component for /today and /payruns so both speak with one voice. Server
// component; renders the client RunButton only in the READY state.

import Link from 'next/link';
import type { PayrunSituation } from '@/lib/payruns/pipeline';
import RunButton from '@/components/page/RunButton';

function PipelineStrip({ p }: { p: PayrunSituation['pipeline'] }) {
  const stages: Array<{ label: string; n: number; hot?: boolean }> = [
    { label: 'On site', n: p.onSite },
    { label: 'With supervisor', n: p.awaitingSupervisor },
    { label: 'Your approval', n: p.awaitingYou, hot: true },
    { label: 'Ready to run', n: p.approvedToRun },
  ].filter((s) => s.n > 0);
  if (stages.length === 0) return null;
  return (
    <div className="prun-strip" aria-label="Where this run’s shifts sit">
      {stages.map((s, i) => (
        <span key={s.label} className="prun-stage-wrap">
          <span className={`prun-stage${s.hot ? ' hot' : ''}`}>
            {s.label} <b>{s.n}</b>
          </span>
          {i < stages.length - 1 ? <span className="prun-sep">›</span> : null}
        </span>
      ))}
    </div>
  );
}

export default function PayrunCta({
  situation,
  runEnabled,
}: {
  situation: PayrunSituation;
  runEnabled: boolean;
}) {
  const s = situation;

  if (s.state === 'READY') {
    return (
      <div className={`prun prun-go`}>
        <RunButton canRun={true} enabled={runEnabled} label={s.runLabel} reason={s.runReason} />
        <p className="prun-note">{s.detail}</p>
      </div>
    );
  }

  if (s.state === 'CAUGHT_UP') {
    return (
      <div className="prun prun-calm">
        <span className="prun-ic ok" aria-hidden="true">
          <i className="ti ti-check" />
        </span>
        <div className="prun-body">
          <p className="prun-head">{s.headline}</p>
          <p className="prun-note">{s.detail}</p>
        </div>
        {s.secondary !== null ? (
          <Link className="prun-link" href={s.secondary.href}>
            {s.secondary.label} →
          </Link>
        ) : null}
      </div>
    );
  }

  if (s.state === 'HELD') {
    return (
      <div className="prun prun-alarm">
        <span className="prun-ic alarm" aria-hidden="true">
          <i className="ti ti-alert-triangle" />
        </span>
        <div className="prun-body">
          <p className="prun-head">{s.headline}</p>
          <p className="prun-note">{s.detail}</p>
        </div>
        {s.primary !== null ? (
          <Link className="runbtn blocked" href={s.primary.href}>
            {s.primary.label}
          </Link>
        ) : null}
      </div>
    );
  }

  // ALMOST
  return (
    <div className="prun prun-work">
      <PipelineStrip p={s.pipeline} />
      <div className="prun-act">
        <div className="prun-body">
          <p className="prun-head">{s.headline}</p>
          {s.notes.map((n) => (
            <p className="prun-note" key={n}>
              {n}
            </p>
          ))}
        </div>
        {s.primary !== null ? (
          <Link className="runbtn ready" href={s.primary.href}>
            {s.primary.label}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
