// Pay runs — demo (synthetic, demo canon only). Spec SS6: assembling
// card + kept runs (hours, super, status). "A pay run is a pack you
// can prove."

import { brandLine } from '@/lib/page/flags';

const KEPT_RUNS = [
  { period: '1–7 Jun', hours: '388.25', superLine: 'super landed · 9 Jun', status: 'kept', pack: 'pack 4f2a91…c803' },
  { period: '25–31 May', hours: '402.00', superLine: 'super landed · 2 Jun', status: 'kept', pack: 'pack b7d044…12ef' },
  { period: '18–24 May', hours: '395.50', superLine: 'super landed · 26 May', status: 'kept', pack: 'pack 90ce5a…77b1' },
] as const;

export default function PayRunsDemoPage() {
  return (
    <main>
      <div className="top">
        <span className="wordmark">FLOSTRUCTION</span>
        <span className="mono" role="note">
          demo page · synthetic records · Demo Labour Hire Pty Ltd
        </span>
        <span className="chaintext mono">chain verified · 96/96</span>
      </div>
      <div className="greet">
        <div className="day">Pay runs · demo</div>
        <h1>A pay run is a pack you can prove.</h1>
        <p className="sub">
          Every run is assembled from sealed records, fingerprinted, and kept. The current run
          stays held until the page says it is safe.
        </p>
      </div>

      <section className="payrun" aria-label="Assembling pay run">
        <div className="head">
          <span className="t">Assembling · Wednesday’s run</span>
          <span className="when">Payday Super · 7-day window</span>
        </div>
        <div className="thread" role="img" aria-label="Pay run progress">
          <span className="a" style={{ width: '79%' }} />
          <span className="b" style={{ width: '12%' }} />
        </div>
        <div className="reading">
          <p>
            <span className="n g">96</span> verified hours drafted ·{' '}
            <span className="n m">3</span> still in motion · <span className="n">2</span> decisions
            from safe.
          </p>
          <button type="button" className="runbtn" disabled title="Demo — running arrives with Phase 2">
            Run when safe
          </button>
        </div>
      </section>

      <section className="sect" aria-label="Kept runs">
        <h2 className="label">Kept runs</h2>
        {KEPT_RUNS.map((r) => (
          <div className="h-row" key={r.period}>
            <span className="tick" />
            <p>
              <b>{r.period}</b> — {r.hours} verified hours sent to payroll · {r.superLine}.
            </p>
            <span className="ref">{r.pack}</span>
          </div>
        ))}
      </section>

      <div className="archive">
        <div className="line">A run you can prove is a run nobody argues with.</div>
      </div>

      <div className="pagefoot">
        <span />
        <span className="brandline">{brandLine()}</span>
      </div>
    </main>
  );
}
