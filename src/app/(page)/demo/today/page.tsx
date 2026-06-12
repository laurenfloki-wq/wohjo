'use client';

// The demo daily page — no session, no database, demo canon only
// (rail 3). Scenario buttons rehearse the cleared state and the bad
// morning, as the directors-approved prototype does.

import { useMemo, useState } from 'react';
import { buildDemoModel, type DemoScenario } from '@/lib/page/demo-model';
import TodayView from '../../today/TodayView';

export default function TodayDemoPage() {
  const [scenario, setScenario] = useState<DemoScenario>('morning');
  const model = useMemo(() => buildDemoModel(scenario, new Date()), [scenario]);
  return (
    <>
      <TodayView key={scenario} model={model} />
      <div
        style={{ position: 'fixed', right: 18, bottom: 18, display: 'flex', gap: 8, zIndex: 50 }}
      >
        {(
          [
            ['morning', 'A normal morning'],
            ['cleared', 'The cleared state'],
            ['bad', 'A bad morning'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={key === scenario ? 'btn amber' : 'btn quiet'}
            onClick={() => setScenario(key)}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}
