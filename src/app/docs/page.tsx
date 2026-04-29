// /docs — FLOSTRUCTION reference implementation documentation
//
// PLACEHOLDER STATUS: as of 2026-04-29, no canonical FLOSTRUCTION docs
// source has been identified in ~/OneDrive/FLOSMOSIS/ or earlier Council
// session outputs. This page provides a navigational stub pointing to
// available related resources, plus a contact path for documentation
// requests.
//
// When canonical FLOSTRUCTION documentation is authored, replace the
// content below with a fs.readFileSync pattern matching the WLES pages
// (see src/app/wles/spec/page.tsx for the pattern).

import type { Metadata } from 'next';
import WlesLayout from '@/components/wles/WlesLayout';

export const metadata: Metadata = {
  title: 'Documentation — FLOSTRUCTION',
  description:
    'Reference implementation documentation for FLOSTRUCTION, the records substrate published by FLOSMOSIS PTY LTD.',
  alternates: {
    canonical: 'https://flosmosis.com/docs',
  },
};

export default function DocsPage() {
  return (
    <WlesLayout title="Documentation — FLOSTRUCTION" active="wles">
      <h1>FLOSTRUCTION Documentation</h1>

      <p className="lede">
        FLOSTRUCTION is the records substrate published by FLOSMOSIS PTY LTD
        and the reference implementation of WLES v1.0 in production use for
        Australian construction labour-hire records.
      </p>

      <h2>Current resources</h2>

      <p>
        Comprehensive FLOSTRUCTION documentation is in preparation. In the
        interim, the following resources are publicly available:
      </p>

      <ul>
        <li>
          <a href="/wles/spec">WLES v1.0 Specification</a> — the technical
          standard FLOSTRUCTION implements, including canonical-JSON event
          schema, SHA-256 chain construction, and conformance requirements.
        </li>
        <li>
          <a href="/wles">WLES landing</a> — overview of the Workforce
          Labour Event Standard, royalty-free open standard.
        </li>
        <li>
          <a href="/wles/foundation/constitution">
            WLES Foundation Constitution
          </a>{' '}
          — formation-phase governance document; binding commitment to
          separate-entity incorporation within 24 months.
        </li>
        <li>
          <a href="/privacy">FLOSMOSIS Privacy Policy</a> — data handling
          practices for FLOSTRUCTION records.
        </li>
        <li>
          <a href="/terms">FLOSMOSIS Terms of Service</a> — terms covering
          use of the FLOSTRUCTION reference implementation.
        </li>
      </ul>

      <h2>Documentation in preparation</h2>

      <p>
        Detailed reference materials covering the FLOSTRUCTION
        implementation, integration patterns, and operational guidance are
        being authored alongside the formation-phase WLES Foundation work.
        The following documentation areas are planned for publication
        during the 18-24 month formation horizon:
      </p>

      <ul>
        <li>FLOSTRUCTION reference architecture and data model</li>
        <li>WLES v1.0 conformance test vectors with worked examples</li>
        <li>Integration guide for payroll system implementers</li>
        <li>
          Worker-facing record export formats (CSV, JSON, printable
          receipt)
        </li>
        <li>
          Independent verifier CLI: invocation, validation rules, exit
          codes, and integration into third-party audit pipelines
        </li>
        <li>
          Operational runbooks for deployers (Vercel + Supabase reference
          deployment)
        </li>
      </ul>

      <h2>Contact</h2>

      <p>
        For documentation requests, integration questions, or to receive
        notification when new FLOSTRUCTION documentation is published,
        contact{' '}
        <a href="mailto:standards@flosmosis.com">standards@flosmosis.com</a>.
      </p>

      <h2>Reference implementation source</h2>

      <p>
        The FLOSTRUCTION reference implementation source is currently
        held privately by FLOSMOSIS PTY LTD during the formation phase.
        Per the WLES Foundation Constitution clause 1.3 ("Continuity Through
        Incorporation"), all intellectual property associated with the
        Foundation is committed to transfer to the separately-incorporated
        WLES Foundation entity upon incorporation, with terms preserving
        the open-licence commitments.
      </p>

      <hr />

      <p style={{ fontSize: 13, color: '#55555C', fontStyle: 'italic' }}>
        This page will be replaced with comprehensive FLOSTRUCTION
        reference documentation when prepared. Last updated 2026-04-29.
      </p>
    </WlesLayout>
  );
}
