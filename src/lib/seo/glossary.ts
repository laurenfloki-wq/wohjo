// The glossary term set: plain-English definitions of the labour hire,
// compliance, and worked-hour-records vocabulary the rest of the site uses.
// One source for the /glossary page and its DefinedTermSet JSON-LD.
//
// The Workforce Ledger Evidentiary Standard (WLES) is deliberately NOT
// redefined here — it has its own canonical DefinedTermSet at /wles
// (Wikidata Q140353677). The glossary links to it instead of duplicating it.

export const GLOSSARY_PATH = '/glossary';
export const GLOSSARY_MODIFIED = '2026-06-27';

export interface GlossaryTerm {
  /** Stable anchor slug for deep-linking (e.g. #burden-of-proof). */
  slug: string;
  /** The term. */
  term: string;
  /** Self-contained, citable definition (no schema markup in here). */
  definition: string;
}

/**
 * Terms are ordered for reading, not alphabetised — related concepts sit
 * together. Definitions are written to stand alone if lifted by an answer
 * engine, so each names its own subject.
 */
export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    slug: 'labour-hire',
    term: 'Labour hire',
    definition:
      'An arrangement in which a business (the labour hire provider or agency) supplies its workers to perform work for another business (the host), while remaining the legal employer responsible for paying the worker and meeting employment obligations.',
  },
  {
    slug: 'labour-hire-licence',
    term: 'Labour hire licence',
    definition:
      'A licence a labour hire provider must hold to supply workers in jurisdictions that run a mandatory scheme. In Australia, Queensland, Victoria, South Australia and the ACT operate licensing schemes; New South Wales, Western Australia, Tasmania and the Northern Territory do not.',
  },
  {
    slug: 'host-employer',
    term: 'Host (host employer)',
    definition:
      'The business that engages a labour hire provider and directs the supplied workers on site. The host controls the work but is not ordinarily the legal employer; the provider retains the payroll and record-keeping obligations.',
  },
  {
    slug: 'worked-hour-record',
    term: 'Worked-hour record',
    definition:
      'The record of the hours an employee actually worked — start and finish times, and any unpaid breaks. Under the Fair Work Act employers must make and keep accurate records of this kind for seven years.',
  },
  {
    slug: 'contemporaneous-record',
    term: 'Contemporaneous record',
    definition:
      'A record made at or near the time of the event it describes, rather than reconstructed later from memory. Contemporaneous worked-hour records carry more evidentiary weight because they are made before any dispute arises.',
  },
  {
    slug: 'tamper-evident-record',
    term: 'Tamper-evident record',
    definition:
      'A record where any change to a finalised entry can be detected after the fact, typically through a cryptographic seal and an append-only log. It is distinct from tamper-proof: alteration may be possible, but it cannot happen without leaving a visible trace.',
  },
  {
    slug: 'burden-of-proof',
    term: 'Burden of proof (reverse onus)',
    definition:
      'The obligation to prove a claim. Under section 557C of the Fair Work Act 2009, where an employer failed to keep required records or issue pay slips and an underpayment claim is made in a court proceeding, the burden shifts to the employer to disprove the claim, unless it has a reasonable excuse.',
  },
  {
    slug: 'accessorial-liability',
    term: 'Accessorial liability',
    definition:
      'Liability extended to a person or business that was knowingly involved in another party’s contravention of the Fair Work Act. It can reach a host business, a director, or an adviser who was involved in an underpayment, not only the direct employer.',
  },
  {
    slug: 'superannuation-guarantee',
    term: 'Superannuation Guarantee (SG)',
    definition:
      'The compulsory superannuation contribution an employer must pay on an eligible worker’s earnings, set as a percentage of ordinary time earnings. It is the baseline obligation that Payday Super changes the timing of.',
  },
  {
    slug: 'payday-super',
    term: 'Payday Super',
    definition:
      'The reform, commencing 1 July 2026, requiring superannuation to be paid on every pay run rather than quarterly, with contributions received by the employee’s fund within seven business days of payday. It applies to all employers with no phase-in.',
  },
  {
    slug: 'super-guarantee-charge',
    term: 'Super Guarantee Charge (SGC)',
    definition:
      'The charge an employer becomes liable for when Superannuation Guarantee contributions are not paid in full and on time. It is not tax deductible and can include penalties and interest; under Payday Super the triggers for it arrive every pay run.',
  },
  {
    slug: 'modern-award',
    term: 'Modern award',
    definition:
      'An instrument that sets minimum pay rates and conditions for an industry or occupation, such as the Building and Construction General On-site Award. Worked hours feed award calculations, so an unreliable hours record undermines award compliance.',
  },
];
