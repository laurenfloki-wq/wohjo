'use client';

import { useEffect, useState } from 'react';

/** Elapsed time on a shift that is still recording. Seconds tick
 *  client-side from the sealed start_time — display only. */
export default function LiveTimer({ startIso }: { startIso: string }) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = Math.max(0, Math.floor((now - new Date(startIso).getTime()) / 1000));
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  return (
    <span suppressHydrationWarning>
      {h}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  );
}
