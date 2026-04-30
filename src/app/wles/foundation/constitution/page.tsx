// /wles/foundation/constitution — WLES Foundation Constitution v1.0
//
// Renders the canonical Foundation Constitution as adopted and entered
// into effect on 27 April 2026, governed by the laws of the Australian
// Capital Territory (clause 11).
//
// CRITICAL CONTENT — referenced in all current regulatory submissions:
//   Preamble + clause 1 (definitions, including Foundation Entity =
//                         FLOSMOSIS PTY LTD)
//   Clause 5 — Governance Council (advisory; established within 12
//              months or upon 5th Founding Customer)
//   Clause 6 — Eight Core Principles (Worker Data Sovereignty,
//              Verifiability, Portability, Immutability, Transparency,
//              Interoperability, Privacy by Design, Accessibility)
//   Clause 7.3 — Open standard commitment (Foundation Entity will not
//                use IP rights to unreasonably restrict access or
//                implementation)
//   Clause 8 — Founding Customer Program (Foundation Period ends
//              earlier of 20 customers or 31 December 2027)
//   Clause 11 — Governing law (ACT) + dispute resolution
//
// Source: 2_WLES_Foundation_Constitution_v1_0.docx (canonical legal pack
// on Lauren's Desktop). Body content rendered verbatim.

import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import WlesLayout from '@/components/wles/WlesLayout';

export const metadata: Metadata = {
  title: 'WLES Foundation Constitution v1.0',
  description:
    'The constituting document of the WLES Foundation, adopted 27 April 2026. Establishes FLOSMOSIS PTY LTD as the Foundation Entity, sets out core principles (clause 6), Governance Council establishment (clause 5), and the Foundation Period ending earlier of 20 founding customers or 31 December 2027. Referenced in all current regulatory submissions.',
  alternates: {
    canonical: 'https://flosmosis.com/wles/foundation/constitution',
  },
};

const html = fs.readFileSync(
  path.join(process.cwd(), 'src/content/wles/wles-foundation-constitution.html'),
  'utf-8',
);

export default function WlesFoundationConstitutionPage() {
  return (
    <WlesLayout
      title="WLES Foundation Constitution"
      active="foundation"
    >
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </WlesLayout>
  );
}
