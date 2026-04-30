// /wles/foundation — WLES Foundation overview
//
// Renders the canonical Foundation home page from
// src/content/wles/wles-foundation.html.
//
// Source: ~/OneDrive/FLOSMOSIS/foundation-wles-io/index.html
// (transformed: cross-WLES-site links rewritten)

import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import WlesLayout from '@/components/wles/WlesLayout';

export const metadata: Metadata = {
  title: 'WLES Foundation — Standards Body for the Workforce Ledger Evidentiary Standard',
  description:
    'The WLES Foundation publishes and maintains the Workforce Ledger Evidentiary Standard. FLOSMOSIS PTY LTD is the Foundation Entity per Constitution v1.0 (effective 27 April 2026, governed by Australian Capital Territory law).',
  alternates: {
    canonical: 'https://flosmosis.com/wles/foundation',
  },
};

const html = fs.readFileSync(
  path.join(process.cwd(), 'src/content/wles/wles-foundation.html'),
  'utf-8',
);

export default function WlesFoundationPage() {
  return (
    <WlesLayout
      title="WLES Foundation"
      active="foundation"
    >
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </WlesLayout>
  );
}
