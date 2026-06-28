// The Exposure Ledger — the signature result element (§7).
//
// Not a marketing gauge: each risk vector is rendered as a line in an
// engraved, monospaced record — like one of the platform's tamper-evident
// receipts — stamped Clear / Watch / Exposed / N/A, with the cited rule shown
// as provenance and, for every flagged line, the low-effort next step paired
// immediately beneath it (JOLT §2.4: diagnosis + path, never diagnosis +
// dread). One clear recommended action sits above the ledger.
//
// Language stays indicative throughout — "indicators suggest elevated
// exposure", never "you are non-compliant" (§8.3). DRAFT scoring is never
// presented as authoritative.

import type { Band, ExposureResult } from '@/lib/exposure/types';
import { RULES } from '@/lib/exposure/rules.config';

const BAND_LABEL: Record<Band, string> = {
  clear: 'Clear',
  watch: 'Watch',
  exposed: 'Exposed',
  na: 'N/A',
};

function blurbFor(vectorId: string): string {
  return RULES.vectors.find((v) => v.id === vectorId)?.blurb ?? '';
}

function headline(result: ExposureResult): { title: string; sub: string } {
  const exposedCount = result.vectors.filter((v) => v.band === 'exposed').length;
  const watchCount = result.vectors.filter((v) => v.band === 'watch').length;
  if (result.overall === 'exposed') {
    return {
      title: `Indicators suggest elevated exposure in ${exposedCount} area${exposedCount === 1 ? '' : 's'}.`,
      sub: 'Each gap below is paired with the one next step that closes it. This is an indicative self-assessment, not legal advice.',
    };
  }
  if (result.overall === 'watch') {
    return {
      title: `A few areas worth tightening${watchCount ? ` (${watchCount})` : ''}.`,
      sub: 'Nothing here is alarming — but a couple of things are worth confirming before 1 July 2026. Indicative only, not legal advice.',
    };
  }
  return {
    title: 'No elevated exposure flagged.',
    sub: 'Based on what you told us, your records and obligations look in order. Worth a short call to confirm they hold up. Indicative only, not legal advice.',
  };
}

export function ExposureLedger({ result }: { result: ExposureResult }) {
  const { title, sub } = headline(result);
  const biggest = result.biggestGap
    ? result.vectors.find((v) => v.vector === result.biggestGap)
    : null;

  return (
    <div className="exposure-animate">
      <div className="exposure-ledger-head">
        <span className="exposure-ledger-meta">EXPOSURE CHECK · INDICATIVE</span>
        <span className="exposure-ledger-meta">ruleset {result.version}</span>
      </div>

      <h2 className="exposure-headline">{title}</h2>
      <p className="exposure-headline-sub">{sub}</p>

      {biggest ? (
        <div className="exposure-biggest">
          <p className="exposure-biggest-k">Your biggest gap</p>
          <p className="exposure-biggest-title">{biggest.label}</p>
          <p className="exposure-biggest-step">{biggest.nextStep}</p>
        </div>
      ) : null}

      <div className="exposure-rows" role="list" aria-label="Exposure by area">
        {result.vectors.map((v) => {
          const flagged = v.band === 'watch' || v.band === 'exposed';
          return (
            <div className="exposure-row" role="listitem" key={v.vector}>
              <span className="exposure-row-label">{v.label}</span>
              <span className="exposure-chip" data-band={v.band}>
                <span className="exposure-dot" aria-hidden="true" />
                {BAND_LABEL[v.band]}
              </span>
              <p className="exposure-row-blurb">{blurbFor(v.vector)}</p>
              {flagged ? <p className="exposure-row-step">{v.nextStep}</p> : null}
              {flagged ? (
                <p className="exposure-row-source">
                  Source:{' '}
                  <a href={v.source.url} target="_blank" rel="noopener noreferrer">
                    {v.source.label}
                  </a>
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
