// Structured data for /wles. Makes the Workforce Ledger Evidentiary
// Standard machine-readable and citable as a named standard: a TechArticle
// describing it, plus a DefinedTermSet carrying its eight core principles
// (definitions verbatim from the canonical /wles content and the WLES
// Foundation Constitution).

import type { JsonLdObject } from '@/lib/seo/jsonld';
import { definedTermSetSchema } from '@/lib/seo/jsonld';
import { ORG, abs } from '@/lib/seo/site';

const WLES_PATH = '/wles';
const WLES_NAME = 'Workforce Ledger Evidentiary Standard (WLES)';
const WLES_DESCRIPTION =
  'An open evidentiary framework for creating verifiable, portable and immutable records of workforce competency, compliance and labour-event data, maintained by FLOSMOSIS PTY LTD as the Foundation Entity.';

export const wlesDefinedTermSet: JsonLdObject = definedTermSetSchema({
  name: WLES_NAME,
  description: WLES_DESCRIPTION,
  path: WLES_PATH,
  terms: [
    {
      name: 'Worker Data Sovereignty',
      description: 'Workers own and control their workforce data at all times.',
    },
    {
      name: 'Verifiability',
      description:
        'All records must be independently verifiable through cryptographic or other reliable means.',
    },
    {
      name: 'Portability',
      description:
        'Workforce records must be portable across employers, platforms and jurisdictions.',
    },
    {
      name: 'Immutability',
      description:
        'Once verified, records must be tamper-evident and resistant to unauthorised alteration.',
    },
    {
      name: 'Transparency',
      description:
        'The WLES framework, specifications and governance processes must be open and transparent.',
    },
    {
      name: 'Interoperability',
      description:
        'The WLES must support interoperability with existing workforce management systems and standards.',
    },
    {
      name: 'Privacy by Design',
      description: 'Worker privacy must be embedded into the technical architecture of the WLES.',
    },
    {
      name: 'Accessibility',
      description:
        'The WLES must be accessible to workers, employers and regulators regardless of technical capability.',
    },
  ],
});

export const wlesTechArticle: JsonLdObject = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: WLES_NAME,
  description: WLES_DESCRIPTION,
  datePublished: '2026-04-27',
  dateModified: '2026-04-27',
  inLanguage: 'en-AU',
  // The standard is authored and maintained by the Foundation Entity, not
  // an individual — so the author here is the organisation, not a Person.
  author: { '@id': ORG.id },
  publisher: { '@id': ORG.id },
  mainEntityOfPage: { '@type': 'WebPage', '@id': abs(WLES_PATH) },
  about: [
    { '@type': 'Thing', name: 'Workforce records' },
    { '@type': 'Thing', name: 'Tamper-evident records' },
    { '@type': 'Thing', name: 'Labour hire' },
  ],
  mentions: { '@id': `${abs(WLES_PATH)}#termset` },
};

export const WLES_SCHEMA: JsonLdObject[] = [wlesTechArticle, wlesDefinedTermSet];
