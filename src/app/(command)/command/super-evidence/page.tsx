// /command/super-evidence is replaced by /command/evidence as part of
// the de-jargoned nav. Old deep links still work via this redirect.

import { redirect } from 'next/navigation';

export default function SuperEvidenceRedirect() {
  redirect('/command/evidence');
}
