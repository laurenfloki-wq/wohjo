// /wles/implementers — F6 nav stub for prospective WLES implementers
//
// Per WLES Foundation Constitution v1.0 (effective 27 April 2026,
// FLOSMOSIS PTY LTD as Foundation Entity, ACT-law governance) cl 7.3
// (open standard) and cl 6 (Core Principles, including Interoperability),
// any organisation may build a WLES-conformant system on equal terms.
// This page provides the front-door scoping content and an interest
// capture for organisations evaluating WLES implementation.

import type { Metadata } from 'next';
import WlesLayout from '@/components/wles/WlesLayout';
import WlesInterestForm from '@/components/wles/WlesInterestForm';

export const metadata: Metadata = {
  title: 'WLES Implementers — Building a WLES-conformant system',
  description:
    'Engagement information for organisations building WLES-conformant systems. Per WLES Foundation Constitution v1.0 clause 7.3, the WLES is maintained as an open standard. Any organisation may implement WLES on equal terms.',
  alternates: {
    canonical: 'https://flosmosis.com/wles/implementers',
  },
};

export default function WlesImplementersPage() {
  return (
    <WlesLayout title="WLES Implementers" active="implementers">
      <h1>Implementers</h1>

      <p className="lede">
        WLES is an open standard. Per WLES Foundation Constitution v1.0
        clause 7.3, FLOSMOSIS PTY LTD (ACN 697 323 925) as the Foundation
        Entity is committed to maintaining the WLES as an open standard
        and will not use intellectual property rights to unreasonably
        restrict access to or implementation of the WLES. Any organisation
        may build a WLES-conformant system.
      </p>

      <h2>What an implementer does</h2>
      <p>
        An implementer is an organisation that builds a system producing
        WLES-conformant records. Implementation involves adopting the
        canonical-JSON event schema, the SHA-256 chain construction, the
        receipt format, and the conformance requirements set out in the{' '}
        <a href="/wles/spec">WLES v1.0 specification</a>.
      </p>

      <h2>Reference implementation</h2>
      <p>
        FLOSTRUCTION is the reference implementation of WLES v1.0 in
        production for Australian construction labour-hire records. Its
        documentation is available at{' '}
        <a href="/docs">flosmosis.com/docs</a> and is the operational
        view of WLES record production, sealing, chaining, and
        verification.
      </p>

      <h2>Engagement</h2>
      <p>
        The Foundation Entity is interested to hear from organisations
        evaluating WLES implementation. Per Constitution clause 6
        (Interoperability and Accessibility) the Foundation supports
        cross-system interoperability with existing workforce management
        systems and standards.
      </p>

      <p>
        Register your interest below or contact{' '}
        <a href="mailto:standards@flosmosis.com">standards@flosmosis.com</a>{' '}
        directly.
      </p>

      <WlesInterestForm interest="implementer" />

      <h2>Founding Customer Program</h2>
      <p>
        Implementers building reference systems are distinct from
        Founding Customers under Constitution clause 8. The Founding
        Customer Program runs during the Foundation Period (until the
        earlier of 20 founding customers or 31 December 2027) and is the
        path for organisations adopting WLES through the FLOSTRUCTION
        reference implementation. Implementers building independent
        WLES-conformant systems engage directly with the standard.
      </p>
    </WlesLayout>
  );
}
