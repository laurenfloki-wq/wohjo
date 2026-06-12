// People — demo (synthetic, demo canon only). Spec SS6: three doors
// (Found for you / Add someone / Supervising); lifetime verified hours
// as the relationship number.

import { brandLine } from '@/lib/page/flags';

const WORKERS = [
  { name: 'Demo Worker', hours: '1,284.5', since: 'since Feb 2026' },
  { name: 'A. Carpenter', hours: '912.0', since: 'since Mar 2026' },
  { name: 'P. Rigger', hours: '688.25', since: 'since Apr 2026' },
] as const;

export default function PeopleDemoPage() {
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
        <div className="day">People · demo</div>
        <h1>A worker’s record belongs to the work, not to the argument.</h1>
        <p className="sub">
          Lifetime verified hours are the relationship number — they follow the worker, sealed,
          wherever the work goes.
        </p>
      </div>

      <section className="sect" aria-label="Doors">
        <div className="doors">
          <div className="door">
            <div className="t">Found for you</div>
            <p>
              One name appeared in Wednesday’s pay items but isn’t on Flostruction yet. One SMS
              invites them — nothing to install.
            </p>
          </div>
          <div className="door">
            <div className="t">Add someone</div>
            <p>
              Name and mobile. They complete their own details on their own phone — the record is
              theirs from the first minute.
            </p>
          </div>
          <div className="door">
            <div className="t">Supervising</div>
            <p>João Silva approves by SMS · median reply 4 min this fortnight.</p>
          </div>
        </div>
      </section>

      <section className="sect" aria-label="Workers">
        <h2 className="label">Workers · 3</h2>
        {WORKERS.map((w) => (
          <div className="site-row" key={w.name}>
            <span className="n">{w.name}</span>
            <span className="s">{w.since}</span>
            <span className="hrs mono">{w.hours} verified hours</span>
            <span className="state sealed">sealed record</span>
          </div>
        ))}
      </section>

      <div className="pagefoot">
        <span />
        <span className="brandline">{brandLine()}</span>
      </div>
    </main>
  );
}
