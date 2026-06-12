import { redirect } from 'next/navigation';

// The demo walkthrough lives under /demo/* so the rail can stay inside
// it. This route survives for links already shared.
export default function TodayDemoRedirect() {
  redirect('/demo/today');
}
