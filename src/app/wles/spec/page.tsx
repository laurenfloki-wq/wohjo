// /wles/spec — WLES v1.0 Specification (canonical)
//
// Renders the canonical WLES v1.0 specification from
// src/content/wles/wles-spec.html.
//
// Source: ~/OneDrive/FLOSMOSIS/wles-io/spec/v1.0/index.html
// (transformed: cross-WLES-site links rewritten to /wles/* paths)

import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import WlesLayout from '@/components/wles/WlesLayout';

export const metadata: Metadata = {
  title: 'WLES v1.0 Specification — Workforce Labour Event Standard',
  description:
    'The canonical WLES v1.0 technical specification: canonical-JSON event schema, SHA-256 chain construction, signature semantics, conformance requirements.',
  alternates: {
    canonical: 'https://flosmosis.com/wles/spec',
  },
};

const html = fs.readFileSync(
  path.join(process.cwd(), 'src/content/wles/wles-spec.html'),
  'utf-8',
);

export default function WlesSpecPage() {
  return (
    <WlesLayout
      title="WLES v1.0 Specification"
      active="spec"
    >
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </WlesLayout>
  );
}
