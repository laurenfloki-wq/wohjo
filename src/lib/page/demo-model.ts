// Synthetic demo models — DEMO CANON ONLY (dispatch rail 3):
// Demo Labour Hire Pty Ltd · Joao Silva (supervisor) · A. Carpenter ·
// P. Rigger · Demo Worker · Mt Stromlo Works (FSTR-0001 lineage).
// Nothing here touches the database; every number is openly invented
// and the page banner says so. demo-model.test.ts pins the canon.

import type { TodayModel } from '@/lib/page/today-model';
import { brandLine } from '@/lib/page/flags';

export type DemoScenario = 'morning' | 'cleared' | 'bad';

const DAY_MS = 86400000;

function demoBase(now: Date): Omit<TodayModel, 'greeting' | 'broken' | 'chainText' | 'provenance' | 'failure' | 'payrun' | 'decisions'> {
  const dateLabel = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(now);
  const weekday = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'long',
  }).format(now);
  return {
    demo: true,
    dateLabel,
    dayLabel: `${weekday}’s page · demo`,
    handled: [
      {
        lead: 'Sealed 12 shifts',
        rest: ' — worker and supervisor agreed on every one.',
        refText: 'FSTR-0001–FSTR-0012',
        eventIds: [],
        tone: 'calm',
      },
      {
        lead: 'Chased two slow approvals',
        rest: ' — both resolved without you.',
        refText: '07:12 · 09:40',
        eventIds: [],
        tone: 'calm',
      },
      {
        lead: 'Drafted Wednesday’s export',
        rest: ' — 96 verified hours ready for your payroll, held until you run it.',
        refText: 'held',
        eventIds: [],
        tone: 'calm',
      },
      {
        lead: 'Re-verified the whole chain',
        rest: ' — 96 of 96 hashes intact.',
        refText: 'anchored 17:15 AEST',
        eventIds: [],
        tone: 'calm',
      },
    ],
    onsite: [
      {
        key: 'joao',
        name: 'João Silva',
        site: 'Mt Stromlo Works',
        hours: null,
        startIso: new Date(now.getTime() - 8 * 3600 * 1000).toISOString(),
        state: 'recording',
      },
      {
        key: 'demo-worker',
        name: 'Demo Worker',
        site: 'Mt Stromlo Works · FSTR-0012',
        hours: '7.50',
        startIso: null,
        state: 'sealed',
      },
      {
        key: 'carpenter',
        name: 'A. Carpenter',
        site: 'Mt Stromlo Works',
        hours: '7.75',
        startIso: null,
        state: 'awaiting',
      },
      {
        key: 'rigger',
        name: 'P. Rigger',
        site: 'Mt Stromlo Works · FSTR-0011',
        hours: '8.00',
        startIso: null,
        state: 'sealed',
      },
    ],
    archiveCount: 48,
    weekRecords: 96,
    footState: 'all hashes verified',
    brand: brandLine(),
  };
}

export function buildDemoModel(scenario: DemoScenario, now: Date): TodayModel {
  const base = demoBase(now);
  const superDate = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(now.getTime() + 7 * DAY_MS));
  const marks = [
    { pos: 'left' as const, text: `today · ${base.dateLabel}` },
    { pos: 'mid' as const, text: 'payday · in 5 days' },
    { pos: 'right' as const, text: `super lands · ${superDate}` },
  ];

  if (scenario === 'bad') {
    return {
      ...base,
      broken: true,
      chainText: 'chain alert · 95/96',
      footState: '95/96 hashes verified · 1 held',
      provenance:
        'prepared 05:12 · fault isolated to FSTR-0009 · evidence held · everything else verified clean',
      greeting: {
        before: 'Good morning. ',
        emphasis: 'One record failed verification overnight',
        emphasisTone: 'alarm',
        after: ' — the chain caught it and nothing has been lost.',
        sub: 'FSTR-0009 no longer matches its sealed hash. Both the original and the altered values are preserved as evidence below. The pay run is held until you review it.',
      },
      failure: {
        lead: 'One record failed verification at 05:12.',
        rest: ' The chain caught it and is holding the evidence — the original sealed value and the altered value are both preserved for you.',
        refText: 'FSTR-0009 · held',
        eventIds: [],
        tone: 'failure',
      },
      payrun: {
        title: 'Pay run · Wednesday',
        sealed: 95,
        inMotion: 1,
        waiting: 2,
        pctA: 79,
        pctB: 12,
        marks,
        situation: {
          state: 'HELD',
          canRun: false,
          tone: 'alarm',
          headline: 'A record needs review before you can run.',
          detail:
            'Nothing exports over a held record — the sealed value and the live value are both kept as evidence.',
          runLabel: '',
          runReason: 'The record is held — review it before running.',
          primary: { label: 'Review the held record →', href: '#handled' },
          secondary: null,
          notes: [],
          pipeline: { onSite: 1, awaitingSupervisor: 0, awaitingYou: 2, approvedToRun: 0 },
        },
      },
      decisions: demoDecisions(),
    };
  }

  if (scenario === 'cleared') {
    return {
      ...base,
      broken: false,
      chainText: 'chain verified · 97/97',
      weekRecords: 97,
      provenance: 'prepared 05:02 · re-verified at approval · export drafted and held',
      greeting: {
        before: 'Good morning. Both decisions are made — Wednesday’s pay run is ',
        emphasis: 'safe to run',
        emphasisTone: 'safe',
        after: '.',
        sub: 'The export is drafted and waiting. Run it whenever suits — it stays safe.',
      },
      failure: null,
      payrun: {
        title: 'Pay run · Wednesday',
        sealed: 97,
        inMotion: 2,
        waiting: 0,
        pctA: 91,
        pctB: 7,
        marks,
        situation: {
          state: 'READY',
          canRun: true,
          tone: 'go',
          headline: '12 approved shifts · 412.5 verified hours, ready to run.',
          detail:
            'One run seals the Evidence Pack and the payroll file together — both carry the same hash.',
          runLabel: 'Run pay run · 12 shifts · 412.5 hrs →',
          runReason: '12 approved shifts ready to run.',
          primary: null,
          secondary: null,
          notes: [],
          pipeline: { onSite: 2, awaitingSupervisor: 0, awaitingYou: 0, approvedToRun: 12 },
        },
      },
      decisions: [],
    };
  }

  return {
    ...base,
    broken: false,
    chainText: 'chain verified · 96/96',
    provenance: 'prepared 05:02 · 96 hashes checked · roster compared · 2 reminders sent',
    greeting: {
      before:
        'Good morning. Everything ran properly overnight, and Wednesday’s pay run is 2 decisions from ',
      emphasis: 'safe',
      emphasisTone: 'safe',
      after: '.',
      sub: 'Twelve shifts sealed while you slept. 412.5 hours stand verified this week, 6.2% up on last. Nothing else needs reading.',
    },
    failure: null,
    payrun: {
      title: 'Pay run · Wednesday',
      sealed: 96,
      inMotion: 3,
      waiting: 2,
      pctA: 79,
      pctB: 12,
      marks,
      situation: {
        state: 'ALMOST',
        canRun: false,
        tone: 'work',
        headline: '2 shifts are waiting on your approval.',
        detail: 'Approve to move the run forward — the chain re-checks each one as you do.',
        runLabel: '',
        runReason: 'Nothing approved to run yet.',
        primary: { label: 'Review & approve →', href: '#with-you' },
        secondary: null,
        notes: ['3 shifts are still recording on site.'],
        pipeline: { onSite: 3, awaitingSupervisor: 0, awaitingYou: 2, approvedToRun: 0 },
      },
    },
    decisions: demoDecisions(),
  };
}

function demoDecisions() {
  return [
    {
      shiftId: 'demo-1',
      sentence:
        'A. Carpenter’s 07:45 shift at Mt Stromlo Works is committed and needs your approval.',
      meta: 'Mt Stromlo Works · FSTR-0013 · waiting 22 min',
    },
    {
      shiftId: 'demo-2',
      sentence:
        'P. Rigger’s 08:00 shift at Mt Stromlo Works is committed and needs your approval.',
      meta: 'Mt Stromlo Works · FSTR-0014 · waiting 9 min',
    },
  ];
}
