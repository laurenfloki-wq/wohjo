// How it works — the always-visible 3-step workflow, high on the page so a
// first-time visitor understands the product before they scroll. The deeper
// device demos (Surfaces) show it; this strip states it.
'use client';

import { RevealSection } from './RevealSection';

const STEPS = [
  {
    n: '01',
    title: 'Clock on',
    body: 'The worker starts the shift on site — time and place captured the moment work begins.',
    seal: false,
  },
  {
    n: '02',
    title: 'Approve by SMS',
    body: 'The site supervisor confirms the hours in seconds — one text, no app, no chasing.',
    seal: false,
  },
  {
    n: '03',
    title: 'Sealed & exported',
    body: 'The shift locks into a tamper-proof record and exports clean to your payroll.',
    seal: true,
  },
];

export function Workflow() {
  return (
    <RevealSection as="section" id="how" className="how">
      <div className="wrap">
        <span className="eyebrow reveal d1">How it works</span>
        <h2 className="reveal d2">
          Clock on. Approve by SMS. <span className="o">Sealed.</span>
        </h2>
        <div className="flow reveal d3">
          {STEPS.map((s, i) => (
            <div className="flowrow" key={s.n}>
              <div className={s.seal ? 'step seal' : 'step'}>
                <span className="n">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
              {i < STEPS.length - 1 ? (
                <span className="arr" aria-hidden="true">→</span>
              ) : null}
            </div>
          ))}
        </div>
        <p className="fitline reveal d4">We verify the hours. Your payroll does the pay.</p>
      </div>
    </RevealSection>
  );
}
