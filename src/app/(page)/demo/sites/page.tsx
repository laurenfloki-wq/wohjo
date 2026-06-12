// Sites — demo (synthetic, demo canon only). Spec SS6: a day-line per
// live site, legend folded into the label; first site kept forever.
// Presence is evidence, not surveillance — workers see everything we see.

import { brandLine } from '@/lib/page/flags';

const ARRIVALS = [
  { key: 'a1', at: '06:48', live: false },
  { key: 'a2', at: '06:55', live: false },
  { key: 'a3', at: '07:02', live: false },
  { key: 'a4', at: '07:45', live: true },
] as const;

export default function SitesDemoPage() {
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
        <div className="day">Sites · demo</div>
        <h1>Sites end. Their records don’t.</h1>
        <p className="sub">
          A day-line per live site — each dot is an arrival backed by a sign-in and a geofence
          event. Presence is evidence, not surveillance: workers see everything we see.
        </p>
      </div>

      <section className="sect" aria-label="Live sites">
        <h2 className="label">
          Live today · green sealed · amber still recording
        </h2>
        <div className="site-row">
          <span className="n">Mt Stromlo Works</span>
          <span className="s">first site · FSTR-0001 · kept forever</span>
          <span className="dayline" aria-label="Arrivals">
            {ARRIVALS.map((a) => (
              <span
                key={a.key}
                className={`dot${a.live ? ' live' : ''}`}
                title={a.at}
                aria-label={`arrival ${a.at}${a.live ? ' — recording' : ' — sealed'}`}
              />
            ))}
          </span>
          <span className="hrs mono">4 on site</span>
          <span className="state live">recording</span>
        </div>
      </section>

      <div className="archive">
        <div className="line">The first site is kept forever. So is its first page.</div>
      </div>

      <div className="pagefoot">
        <span />
        <span className="brandline">{brandLine()}</span>
      </div>
    </main>
  );
}
