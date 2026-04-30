// /docs — FLOSTRUCTION reference implementation documentation
//
// FLOSTRUCTION is the records substrate published by FLOSMOSIS PTY LTD
// (ACN 697 323 925) and the reference implementation of WLES v1.0
// (Constitution v1.0 effective 27 April 2026, governed by Australian
// Capital Territory law per clause 11). FLOSMOSIS PTY LTD is the
// Foundation Entity for the WLES per Constitution clause 1 (definitions)
// and clause 7.3 (open standard commitment).
//
// This page links the canonical WLES v1.0 specification, the Foundation
// Constitution, and supporting policies, and provides a contact path
// for documentation enquiries. When extended FLOSTRUCTION reference
// material is authored, this page may be migrated to a fs.readFileSync
// pattern matching the WLES content pages (see src/app/wles/spec/page.tsx).

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
        being authored by the Foundation Entity. The following
        documentation areas are planned for publication:
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
        The FLOSTRUCTION reference implementation source is held by
        FLOSMOSIS PTY LTD (ACN 697 323 925) as the Foundation Entity for
        the WLES per WLES Foundation Constitution v1.0 clause 7
        (intellectual property). Per clause 7.3, the Foundation Entity
        is committed to maintaining the WLES as an open standard and
        will not use intellectual property rights to unreasonably
        restrict access to or implementation of the WLES. Per clause
        2.1(d), accreditation and certification processes for WLES
        compliance will be established and described as they come into
        operation.
      </p>

      <hr />

      <p style={{ fontSize: 13, color: '#55555C', fontStyle: 'italic' }}>
        This page will be expanded with comprehensive FLOSTRUCTION
        reference documentation as it is authored. Last updated
        2026-05-01.
      </p>
    </WlesLayout>
  );
}
