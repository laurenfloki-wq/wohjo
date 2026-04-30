// /wles/verifier — F6 nav stub for prospective independent WLES verifiers
//
// Per WLES Foundation Constitution v1.0 (effective 27 April 2026,
// FLOSMOSIS PTY LTD as Foundation Entity, ACT-law governance) cl 6
// (Core Principles, including Verifiability and Transparency) and
// cl 2.1(d) (accreditation and certification processes for WLES
// compliance), the standard is built around independent verifiability.
// This page provides the front-door scoping content and an interest
// capture for organisations preparing to operate as independent
// verifiers.

import type { Metadata } from 'next';
import WlesLayout from '@/components/wles/WlesLayout';
import WlesInterestForm from '@/components/wles/WlesInterestForm';

export const metadata: Metadata = {
  title: 'WLES Verifier — Independent verification of WLES records',
  description:
    'Engagement information for organisations operating independent WLES verifiers. Per WLES Foundation Constitution v1.0 clause 6 (Verifiability) and clause 2.1(d) (accreditation and certification), independent verification is core to the standard.',
  alternates: {
    canonical: 'https://flosmosis.com/wles/verifier',
  },
};

export default function WlesVerifierPage() {
  return (
    <WlesLayout title="WLES Verifier" active="verifier">
      <h1>Independent Verifier</h1>

      <p className="lede">
        Independent verifiability is a core principle of WLES. Per WLES
        Foundation Constitution v1.0 clause 6, all records produced under
        the standard must be independently verifiable through
        cryptographic or other reliable means. Any organisation may
        operate an independent WLES verifier on equal terms with the
        Foundation Entity.
      </p>

      <h2>What a verifier does</h2>
      <p>
        An independent verifier reads WLES records, recomputes the SHA-256
        seal over the canonical-JSON serialisation, checks the
        prior-record-hash chain linkage, and reports any deviation. The
        verifier does not depend on the original issuer&rsquo;s systems
        and can be commissioned by any party (worker, employer, regulator,
        auditor) needing third-party assurance over a record chain.
      </p>

      <h2>Specification reference</h2>
      <p>
        The verification mechanics &mdash; canonical-JSON serialisation,
        SHA-256 over record content, prior-record-hash chain linkage,
        receipt format &mdash; are set out in the{' '}
        <a href="/wles/spec">WLES v1.0 specification</a>. Per Constitution
        clauses 3.3(c), 6, and 7, the Foundation Entity maintains the
        canonical specification.
      </p>

      <h2>Accreditation and certification</h2>
      <p>
        Per Constitution clause 2.1(d), the Foundation Entity will
        establish accreditation and certification processes for WLES
        compliance. The Governance Council established under clause 5
        will provide input on these processes per clause 5.4(a).
      </p>

      <h2>Engagement</h2>
      <p>
        The Foundation Entity is interested to hear from organisations
        preparing to operate as independent WLES verifiers, including
        audit firms, compliance verifiers, regulators in observer
        capacity, and worker-advocacy organisations.
      </p>

      <p>
        Register your interest below or contact{' '}
        <a href="mailto:standards@flosmosis.com">standards@flosmosis.com</a>{' '}
        directly.
      </p>

      <WlesInterestForm interest="verifier" />
    </WlesLayout>
  );
}
