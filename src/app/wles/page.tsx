// /wles — Workforce Labour Event Standard landing
//
// Renders the canonical WLES landing content from
// src/content/wles/wles-landing.html, wrapped in the WlesLayout shell
// with the formation-phase banner.
//
// Source: ~/OneDrive/FLOSMOSIS/wles-io/index.html (transformed: cross-WLES-
// site links rewritten to /wles/* paths on flosmosis.com).

import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import WlesLayout from '@/components/wles/WlesLayout';

export const metadata: Metadata = {
  title: 'WLES — Workforce Labour Event Standard',
  description:
    'The Workforce Labour Event Standard is an open, royalty-free technical standard for cryptographic verification of labour events in contingent workforce arrangements. Published by the WLES Foundation.',
  alternates: {
    canonical: 'https://flosmosis.com/wles',
  },
};

const html = fs.readFileSync(
  path.join(process.cwd(), 'src/content/wles/wles-landing.html'),
  'utf-8',
);

export default function WlesLandingPage() {
  return (
    <WlesLayout
      title="WLES — Workforce Labour Event Standard"
      active="wles"
    >
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </WlesLayout>
  );
}
