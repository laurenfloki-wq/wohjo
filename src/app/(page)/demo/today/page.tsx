// The demo daily page — no session, no database, demo canon only
// (rail 3). Renders the normal-morning model; the scenario rehearsal
// buttons were removed on founder instruction (2026-06-12).

import { buildDemoModel } from '@/lib/page/demo-model';
import TodayView from '../../today/TodayView';

export const dynamic = 'force-dynamic';

export default function TodayDemoPage() {
  return <TodayView model={buildDemoModel('morning', new Date())} />;
}
