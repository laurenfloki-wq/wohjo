// /wles/foundation/constitution — WLES Foundation Constitution (Charter)
//
// Renders the canonical Foundation Constitution. Per the document itself
// (clause cross-reference): "This document is titled 'Constitution' in
// its internal legal form and is referred to externally as the
// 'Foundation Charter' during the formation phase. References in the text
// below to 'this Constitution' refer to the same document."
//
// CRITICAL CONTENT — referenced in all 6 regulatory submissions:
// Clause 1.2 ("Commitment to Separate Incorporation"): the binding
// commitment of the Founding Member (FLOSMOSIS PTY LTD) to incorporate
// the WLES Foundation as a separate Australian legal entity (company
// limited by guarantee under the Corporations Act 2001 (Cth)) within
// twenty-four months of this document's adoption.
//
// Source: ~/OneDrive/FLOSMOSIS/foundation-wles-io/charter.html
// (transformed: cross-WLES-site links rewritten)

import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import WlesLayout from '@/components/wles/WlesLayout';

export const metadata: Metadata = {
  title: 'WLES Foundation Constitution — Charter (formation phase)',
  description:
    'The constituting document of the WLES Foundation. Includes clause 1.2 binding the Founding Member to separate-entity incorporation within 24 months. Referenced in all current regulatory submissions.',
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
