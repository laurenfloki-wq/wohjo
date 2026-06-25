// The four approved JSON-LD blocks for the Payday Super guide, transcribed
// verbatim from payday-super-labour-hire.html (Organization+Offer,
// BreadcrumbList, TechArticle, FAQPage). Kept byte-faithful to the approved
// file — do not rewrite values. Each is emitted as its own <script> tag by
// the page, mirroring the source document exactly.

import type { JsonLdObject } from '@/lib/seo/jsonld';

const organization: JsonLdObject = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'FLOSMOSIS PTY LTD',
  legalName: 'FLOSMOSIS PTY LTD',
  url: 'https://flosmosis.com',
  logo: 'https://flosmosis.com/marketing/og.png',
  foundingDate: '2026',
  areaServed: 'AU',
  identifier: { '@type': 'PropertyValue', propertyID: 'ACN', value: '697 323 925' },
  makesOffer: {
    '@type': 'Offer',
    itemOffered: {
      '@type': 'SoftwareApplication',
      name: 'Flostruction',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web, iOS, Android',
      description:
        'Time verification for Australian construction and labour hire. Hours are confirmed on site, approved by the supervisor via SMS, and sealed into a permanent, tamper-evident record under the Workforce Ledger Evidentiary Standard (WLES) before they reach payroll.',
      url: 'https://flosmosis.com',
    },
  },
};

const breadcrumb: JsonLdObject = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://flosmosis.com/' },
    { '@type': 'ListItem', position: 2, name: 'Guides', item: 'https://flosmosis.com/guides' },
    {
      '@type': 'ListItem',
      position: 3,
      name: 'Payday Super for labour hire',
      item: 'https://flosmosis.com/payday-super-labour-hire',
    },
  ],
};

const techArticle: JsonLdObject = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline:
    'Payday Super and labour hire: why verified hours have to be right before every pay run',
  description:
    'What Payday Super (1 July 2026) changes for construction labour hire, who it covers, the 7 business day rule, and why verified hours before payroll matter more than quarterly reconciliation.',
  datePublished: '2026-06-24',
  dateModified: '2026-06-24',
  inLanguage: 'en-AU',
  author: {
    '@type': 'Person',
    name: 'Lauren Kate de Mestre',
    jobTitle: 'Director, FLOSMOSIS PTY LTD',
    description: 'Admitted solicitor of the Supreme Court of NSW and former PwC senior consultant.',
    knowsAbout: [
      'Australian workplace compliance',
      'Superannuation Guarantee',
      'Labour hire',
      'Payroll record-keeping',
    ],
  },
  publisher: {
    '@type': 'Organization',
    name: 'FLOSMOSIS PTY LTD',
    logo: { '@type': 'ImageObject', url: 'https://flosmosis.com/marketing/og.png' },
  },
  mainEntityOfPage: {
    '@type': 'WebPage',
    '@id': 'https://flosmosis.com/payday-super-labour-hire',
  },
  speakable: { '@type': 'SpeakableSpecification', cssSelector: ['.answer'] },
  about: [
    { '@type': 'Thing', name: 'Payday Super' },
    { '@type': 'Thing', name: 'Superannuation Guarantee' },
    { '@type': 'Thing', name: 'Construction labour hire' },
    { '@type': 'Thing', name: 'Timesheet verification' },
  ],
};

const faq: JsonLdObject = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is Payday Super and when does it start?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "Payday Super is a reform to the Superannuation Guarantee that starts on 1 July 2026. From that date, Australian employers must pay super at the same time as wages on every pay run, rather than quarterly, and contributions must be received by the employee's super fund within 7 business days of payday. It is legislated under the Treasury Laws Amendment (Payday Superannuation) Act 2025 and applies to all employers, regardless of size.",
      },
    },
    {
      '@type': 'Question',
      name: 'Does Payday Super apply to labour hire workers and contractors?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Payday Super applies to all employers with Superannuation Guarantee obligations, and the rules cover eligible employees as well as independent contractors who are paid mainly for their labour. For labour hire businesses running weekly or fortnightly payroll, that means a super obligation on every run.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is the 7 business day rule under Payday Super?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "From 1 July 2026, super contributions must be received by the employee's super fund within 7 business days of payday. The clock is measured to when the fund receives the money, not when you send it. Because clearing houses can take one to three business days to transmit, most providers recommend initiating payment by day four or five.",
      },
    },
    {
      '@type': 'Question',
      name: 'What happens if worked hours are wrong when super is paid?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'If the hours feeding a pay run are wrong, the super calculated on them is wrong. Underpaid super can trigger the Super Guarantee Charge, which is not tax deductible and can carry penalties of up to 200 percent. The ATO can also issue Director Penalty Notices making directors personally liable. Correcting hours after the money has moved is slower and costlier than getting them right beforehand.',
      },
    },
    {
      '@type': 'Question',
      name: 'Does Flostruction calculate or pay superannuation?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. Flostruction does not calculate wages, award entitlements, tax, or superannuation. It verifies and seals worked hours before they reach payroll, so the hours that feed your super calculation are confirmed on site, approved by the supervisor, and not in dispute. Your payroll and super systems still do the pay and the super.',
      },
    },
    {
      '@type': 'Question',
      name: 'How should a labour hire business get ready for Payday Super?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Confirm your payroll and clearing house can pay super each run within the 7 business day window, replace the Small Business Super Clearing House before it closes on 30 June 2026 if you used it, check employee fund and member details are correct, and make sure the hours feeding each run are verified before payroll rather than reconciled afterward.',
      },
    },
  ],
};

/** The four approved blocks, in document order. */
export const PAYDAY_SCHEMA: JsonLdObject[] = [organization, breadcrumb, techArticle, faq];
