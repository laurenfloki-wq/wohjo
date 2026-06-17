// Presentational daily page — renders a TodayModel and nothing else.
// Server-safe (no hooks); interactive children are client components.

import Link from 'next/link';
import type { TodayModel } from '@/lib/page/today-model';
import DecisionRow from './DecisionRow';
import LiveTimer from './LiveTimer';

export default function TodayView({ model }: { model: TodayModel }) {
  return (
    <main className={model.broken ? 'broken' : ''}>
      <div className="top">
        <span className="wordmark">FLOSTRUCTION</span>
        {model.demo ? (
          <span className="mono" role="note">
            demo page · synthetic records · Demo Labour Hire Pty Ltd
          </span>
        ) : null}
        <span className="chaintext mono">{model.chainText}</span>
        <span className="mono">{model.dateLabel}</span>
      </div>

      <div className="greet">
        <div className="day">{model.dayLabel}</div>
        <h1 aria-live="polite" aria-atomic="true">
          {model.greeting.before}
          <span className={model.greeting.emphasisTone === 'alarm' ? 'alarmword' : 'safeword'}>
            {model.greeting.emphasis}
          </span>
          {model.greeting.after}
        </h1>
        <p className="sub" aria-live="polite" aria-atomic="true">
          {model.greeting.sub}
        </p>
        <div className="prov">{model.provenance}</div>
      </div>

      <section className="payrun" aria-label="Pay run">
        <div className="head">
          <span className="t">{model.payrun.title}</span>
          <span className="when">Payday Super · 7-day window</span>
        </div>
        <div className="thread" role="img" aria-label="Pay run progress">
          <span className="a" style={{ width: `${model.payrun.pctA}%` }} />
          <span className="b" style={{ width: `${model.payrun.pctB}%` }} />
        </div>
        <div className="marks" aria-hidden="true">
          {model.payrun.marks.map((m) => (
            <span
              key={m.text}
              className={`mk${m.pos === 'mid' ? ' mid' : m.pos === 'right' ? ' right' : ''}`}
            >
              <i />
              <b>{m.text}</b>
            </span>
          ))}
        </div>
        <div className="reading">
          <p aria-live="polite" aria-atomic="true">
            <span className="n g">{model.payrun.sealed}</span>{' '}
            {model.payrun.sealed === 1 ? 'record' : 'records'} sealed and verified ·{' '}
            <span className="n m">{model.payrun.inMotion}</span> still in motion on site ·{' '}
            <span className="n">{model.payrun.waiting}</span> waiting on you below.
          </p>
          {model.payrun.runBlocked ? (
            <button
              type="button"
              className="runbtn blocked"
              disabled
              title="Held — review the failed record first"
            >
              {model.payrun.runLabel}
            </button>
          ) : (
            <Link className="runbtn ready" href="/payruns">
              Open pay runs →
            </Link>
          )}
        </div>
      </section>

      <section className="sect" aria-label="With you">
        <h2 className="label">
          With you · {model.decisions.length === 0 ? 'clear' : model.decisions.length}
        </h2>
        {model.decisions.map((d) => (
          <DecisionRow
            key={d.shiftId}
            shiftId={d.shiftId}
            sentence={d.sentence}
            meta={d.meta}
            demo={model.demo}
          />
        ))}
        {model.decisions.length === 0 ? (
          <div className="allclear">
            Nothing is with you. The page will stay quiet until something is.
          </div>
        ) : null}
      </section>

      <section className="sect" aria-label="Handled">
        <h2 className="label">Handled</h2>
        {model.failure !== null ? (
          <div className="h-row alarm">
            <span className="tick" />
            <p>
              <b>{model.failure.lead}</b>
              {model.failure.rest}
            </p>
            <span className="ref">{model.failure.refText}</span>
          </div>
        ) : null}
        {model.handled.map((s, i) => {
          const inner = (
            <>
              <span className="tick" />
              <p>
                <b>{s.lead}</b>
                {s.rest}
              </p>
              <span className="ref">{s.refText}</span>
            </>
          );
          // Each handled sentence is traceable to the rows it was rendered
          // from — link into the first so the operator can open the record
          // (the demo's synthetic ids don't resolve, so it stays inert there).
          return !model.demo && s.eventIds.length > 0 ? (
            <Link className="h-row" href={`/record/${s.eventIds[0]}`} key={i}>
              {inner}
            </Link>
          ) : (
            <div className="h-row" key={i}>
              {inner}
            </div>
          );
        })}
        {model.handled.length === 0 && model.failure === null ? (
          <div className="allclear">Nothing happened overnight. That is the whole report.</div>
        ) : null}
      </section>

      <section className="sect" aria-label="On site now">
        <h2 className="label">
          On site now · {model.onsite.filter((r) => r.state === 'recording').length} recording
        </h2>
        {model.onsite.map((r) => (
          <div className="site-row" key={r.key}>
            <span className="n">{r.name}</span>
            <span className="s">{r.site}</span>
            <span className="hrs mono">
              {r.state === 'recording' && r.startIso !== null ? (
                <LiveTimer startIso={r.startIso} />
              ) : (
                (r.hours ?? '—')
              )}
            </span>
            <span
              className={`state ${r.state === 'recording' ? 'live' : r.state === 'sealed' ? 'sealed' : 'pend'}`}
            >
              {r.state === 'recording' ? 'recording' : r.state === 'sealed' ? 'sealed' : 'awaiting'}
            </span>
          </div>
        ))}
        {model.onsite.length === 0 ? (
          <div className="allclear">No one is on site right now.</div>
        ) : null}
      </section>

      <div className="archive">
        <div className="line">
          Every day writes a page. Pages are kept — yours now number {model.archiveCount}.
        </div>
      </div>

      <div className="pagefoot">
        <span>
          <span className="mono">{model.weekRecords}</span>{' '}
          {model.weekRecords === 1 ? 'record' : 'records'} this week · <b>{model.footState}</b>
        </span>
        <span>tamper-evident · red appears on this page only if a hash breaks</span>
        <span className="brandline">{model.brand}</span>
      </div>
    </main>
  );
}
