// Serializable page model — one shape rendered by TodayView whether the
// numbers come from live rows (today/page.tsx) or the synthetic demo
// canon (today/demo). Keeping the view model explicit means the demo
// can never accidentally reach the database.

import type { PageSentence } from '@/lib/page/sentences';
import type { GreetingModel } from '@/lib/page/today-data';
import type { PayrunSituation } from '@/lib/payruns/pipeline';

export interface TodayDecision {
  shiftId: string;
  sentence: string;
  meta: string;
}

export interface TodaySiteRow {
  key: string;
  name: string;
  site: string;
  /** sealed hours, e.g. "7.50" — null when still recording */
  hours: string | null;
  /** sealed start time ISO for the live timer — null unless recording */
  startIso: string | null;
  state: 'recording' | 'sealed' | 'awaiting';
}

export interface PayRunMark {
  pos: 'left' | 'mid' | 'right';
  text: string;
}

export interface TodayModel {
  /** True only on the synthetic demo page. */
  demo: boolean;
  broken: boolean;
  chainText: string;
  dateLabel: string;
  dayLabel: string;
  greeting: GreetingModel;
  provenance: string;
  payrun: {
    title: string;
    sealed: number;
    inMotion: number;
    waiting: number;
    pctA: number;
    pctB: number;
    marks: PayRunMark[];
    /** The always-actionable card state — replaces the old run button. */
    situation: PayrunSituation;
  };
  decisions: TodayDecision[];
  handled: PageSentence[];
  failure: PageSentence | null;
  onsite: TodaySiteRow[];
  archiveCount: number;
  weekRecords: number;
  footState: string;
  brand: string;
}
