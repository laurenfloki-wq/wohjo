// Payday Super section — flostruction-v5.html:507-528 (v5.1, approved
// in the updated prototype, Lauren 2026-06-10). Sits between the
// problem band and the surfaces section: the problem -> the deadline ->
// the system. Copy is verbatim-locked; para 2 is load-bearing for
// compliance (consistent with the footer disclaimer — do not
// strengthen the claims).
//
// Uses the existing [data-reveal]/.reveal CSS system via RevealSection
// — no GSAP (marketing-route engine policy). The countdown numeral is
// rendered as the em-dash placeholder on the server and filled on
// hydration so a build-time-frozen day count is never statically
// cached (brief, Item 2 "SSR note").
'use client';

import { useEffect, useState } from 'react';
import { RevealSection } from './RevealSection';
import { paydayCountdown, type PaydayClock } from './paydayCountdown';

export function PaydaySection() {
  const [clock, setClock] = useState<PaydayClock | null>(null);

  useEffect(() => {
    setClock(paydayCountdown(Date.now()));
  }, []);

  return (
    <section className="payday" id="payday">
      <RevealSection className="wrap pdgrid">
        <div>
          <span className="eyebrow reveal d1">Payday Super · 1 July 2026</span>
          <h2 className="reveal d2">
            From 1 July, super runs <em>on payday.</em>
          </h2>
          <p className="reveal d3">
            Payday Super starts 1 July 2026: superannuation paid with every pay run, not every quarter. For labour hire that means weekly runs — and weekly exposure. Hours have to be right before payroll, not at reconciliation.
          </p>
          <p className="reveal d3">
            Flostruction doesn&apos;t calculate wages or super. It seals verified hours before they reach your payroll, so every run starts from records nobody disputes.
          </p>
          <div className="pdrows reveal d4">
            <div className="pdrow"><b>EVERY PAY RUN</b><span>super due with wages</span></div>
            <div className="pdrow"><b>WEEKLY RUNS</b><span>weekly exposure</span></div>
            <div className="pdrow"><b>VERIFIED HOURS IN</b><span>clean payroll out</span></div>
          </div>
          <a className="pdlink reveal d4" href="#action">See the system</a>
        </div>
        <div className="pdclock reveal d3">
          <div className="pdnum">{clock ? clock.num : '—'}</div>
          <div className="pdlab">{clock ? clock.label : 'days until Payday Super'}</div>
          <div className="pdsub">1 JULY 2026 · AEST</div>
        </div>
      </RevealSection>
    </section>
  );
}
