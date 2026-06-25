// Labour hire licensing — verified, sourced data for the hub and the
// per-state answer pages. This is the single source for the [state] route,
// the hub comparison table, and the route registry (sitemap/llms/IndexNow).
//
// HARD RULE: every regulatory claim here is sourced to the official
// regulator (see each entry's `sources`) and was verified live against
// that source on 2026-06-25. Nothing is asserted from memory. If a fact
// could not be confirmed on an official source, it is omitted.
//
// As at June 2026, four jurisdictions operate a mandatory labour hire
// licensing scheme — Queensland, Victoria, South Australia and the ACT.
// New South Wales, Western Australia, Tasmania and the Northern Territory
// do not. For the no-scheme jurisdictions the substance is the cross-border
// obligation: supplying workers INTO a scheme jurisdiction requires THAT
// jurisdiction's licence, wherever the business is based.

export interface LicenceSource {
  label: string;
  url: string;
}

export interface LicenceFaq {
  question: string;
  answer: string;
}

export interface StateLicence {
  /** URL slug, e.g. 'queensland'. */
  slug: string;
  /** Full name, e.g. 'Queensland'. */
  state: string;
  /** Abbreviation, e.g. 'QLD'. */
  abbr: string;
  /** Whether a dedicated, mandatory labour hire licensing scheme exists. */
  hasScheme: boolean;
  /** Full Act name (scheme jurisdictions only). */
  act?: string;
  /** Administering regulator (scheme jurisdictions only). */
  regulator?: string;
  /** Official regulator page (scheme jurisdictions). */
  regulatorUrl?: string;
  /** Whether the scheme publishes a searchable public register. */
  publicRegister?: boolean;
  /** Extractable one-paragraph answer (rendered as the speakable lead). */
  answer: string;
  /** "Who must hold a licence / who regulates it" — sourced paragraphs. */
  whoRegulates: string[];
  /** Cross-border obligation for an interstate operator. */
  crossBorder: string;
  /** Optional penalties / register paragraph (scheme jurisdictions). */
  penaltiesRegister?: string;
  /** Visible citations — official regulator pages used on this page. */
  sources: LicenceSource[];
  /** FAQ (schema-backed). */
  faq: LicenceFaq[];
  /** Two related jurisdiction slugs for internal linking. */
  related: [string, string];
  metaTitle: string;
  metaDescription: string;
}

export const LICENCE_HUB_PATH = '/labour-hire-licence';
export const LICENCE_PUBLISHED = '2026-06-25';
export const LICENCE_MODIFIED = '2026-06-25';

const FWO_SOURCE: LicenceSource = {
  label: 'Fair Work Ombudsman — Managing your labour contracting',
  url: 'https://www.fairwork.gov.au/find-help-for/labour-hire-and-supply-chains/managing-your-labour-contracting',
};

export const LICENCE_STATES: StateLicence[] = [
  {
    slug: 'queensland',
    state: 'Queensland',
    abbr: 'QLD',
    hasScheme: true,
    act: 'Labour Hire Licensing Act 2017 (Qld)',
    regulator: 'Labour Hire Licensing Queensland (Office of Industrial Relations)',
    regulatorUrl: 'https://www.labourhire.qld.gov.au/about-licensing-scheme',
    publicRegister: true,
    answer:
      'Yes. Queensland operates a mandatory labour hire licensing scheme under the Labour Hire Licensing Act 2017 (Qld), administered by Labour Hire Licensing Queensland, with a searchable public register. Any business that supplies workers to another business in Queensland must hold a licence, and a business that uses labour hire must only engage a licensed provider.',
    whoRegulates: [
      'The scheme is administered by Labour Hire Licensing Queensland, within the Queensland Office of Industrial Relations, and commenced on 16 April 2018. A provider must be licensed before it supplies labour hire services in Queensland.',
      'The obligation runs both ways: a person who uses labour hire must use a licensed provider. Providing, or using, unlicensed labour hire is an offence under the Act.',
    ],
    crossBorder:
      'The obligation follows where the work is supplied, not where the business is based. A provider based in another state — including New South Wales, which has no scheme of its own — must hold a Queensland licence to supply workers in Queensland.',
    penaltiesRegister:
      'Licensed providers appear on Queensland’s public register, which anyone can search to confirm a provider holds a current licence before engaging them.',
    sources: [
      {
        label: 'Labour Hire Licensing Queensland — About the licensing scheme',
        url: 'https://www.labourhire.qld.gov.au/about-licensing-scheme',
      },
      {
        label: 'Labour Hire Licensing Act 2017 (Qld)',
        url: 'https://www.legislation.qld.gov.au/view/html/inforce/current/act-2017-033',
      },
    ],
    faq: [
      {
        question: 'Do you need a labour hire licence in Queensland?',
        answer:
          'Yes. Any business that supplies workers to another business in Queensland must hold a licence under the Labour Hire Licensing Act 2017 (Qld), and businesses that use labour hire must only engage licensed providers.',
      },
      {
        question: 'Who administers labour hire licensing in Queensland?',
        answer:
          'Labour Hire Licensing Queensland, within the Office of Industrial Relations. The scheme commenced on 16 April 2018.',
      },
      {
        question: 'Does an interstate business need a Queensland licence?',
        answer:
          'Yes. The requirement applies to anyone supplying labour hire in Queensland regardless of where the business is based. An operator based in New South Wales that supplies workers into Queensland needs a Queensland licence.',
      },
      {
        question: 'How do I check whether a provider is licensed in Queensland?',
        answer:
          'Search the public register of licensed providers on the Labour Hire Licensing Queensland website before you engage a provider.',
      },
    ],
    related: ['new-south-wales', 'victoria'],
    metaTitle: 'Labour hire licence in Queensland: do you need one?',
    metaDescription:
      'Yes — Queensland runs a mandatory labour hire licensing scheme under the Labour Hire Licensing Act 2017 (Qld), administered by Labour Hire Licensing Queensland, with a public register.',
  },
  {
    slug: 'victoria',
    state: 'Victoria',
    abbr: 'VIC',
    hasScheme: true,
    act: 'Labour Hire Licensing Act 2018 (Vic)',
    regulator: 'the Labour Hire Authority',
    regulatorUrl: 'https://www.labourhireauthority.vic.gov.au/',
    publicRegister: true,
    answer:
      'Yes. Victoria operates a mandatory labour hire licensing scheme under the Labour Hire Licensing Act 2018 (Vic), administered by the Labour Hire Authority, with a public Labour Hire Licence Register. A provider must be licensed to operate in Victoria, and hosts must use only licensed providers.',
    whoRegulates: [
      'The Labour Hire Authority implements the Labour Hire Licensing Act 2018 (Vic), which introduced a licensing scheme for providers of labour hire across all industry sectors. To operate legally in Victoria, a labour hire provider must be licensed.',
      'Victoria’s labour hire laws are being strengthened in stages during 2026. Changes from 1 June 2026 affect who is considered suitable to hold a labour hire licence; confirm the current position with the Labour Hire Authority.',
    ],
    crossBorder:
      'A provider supplying workers in Victoria must be licensed in Victoria, regardless of where the business is based. Mutual recognition arrangements can affect how an interstate licence is treated — check the Labour Hire Authority for how this applies to your business.',
    penaltiesRegister:
      'Hosts and workers can confirm a provider is licensed using the public Labour Hire Licence Register on the Labour Hire Authority website.',
    sources: [
      {
        label: 'Labour Hire Authority (Victoria)',
        url: 'https://www.labourhireauthority.vic.gov.au/',
      },
      {
        label: 'Labour Hire Licensing Act 2018 (Vic)',
        url: 'https://www.legislation.vic.gov.au/in-force/acts/labour-hire-licensing-act-2018',
      },
    ],
    faq: [
      {
        question: 'Do you need a labour hire licence in Victoria?',
        answer:
          'Yes. Under the Labour Hire Licensing Act 2018 (Vic) a labour hire provider must be licensed to operate in Victoria, and hosts must use only licensed providers.',
      },
      {
        question: 'Who administers labour hire licensing in Victoria?',
        answer: 'The Labour Hire Authority, which maintains a public Labour Hire Licence Register.',
      },
      {
        question: 'Does an interstate business need a Victorian licence?',
        answer:
          'A provider supplying workers in Victoria must be licensed in Victoria. Mutual recognition arrangements can affect how an interstate licence is treated, so check with the Labour Hire Authority.',
      },
      {
        question: 'Are Victoria’s labour hire laws changing?',
        answer:
          'Yes. Victoria’s labour hire laws are being strengthened in stages during 2026, including changes from 1 June 2026 to who is suitable to hold a licence. Confirm the current requirements with the Labour Hire Authority.',
      },
    ],
    related: ['new-south-wales', 'south-australia'],
    metaTitle: 'Labour hire licence in Victoria: do you need one?',
    metaDescription:
      'Yes — Victoria runs a mandatory labour hire licensing scheme under the Labour Hire Licensing Act 2018 (Vic), administered by the Labour Hire Authority, with a public register.',
  },
  {
    slug: 'south-australia',
    state: 'South Australia',
    abbr: 'SA',
    hasScheme: true,
    act: 'Labour Hire Licensing Act 2017 (SA)',
    regulator: 'Consumer and Business Services',
    regulatorUrl: 'https://cbs.sa.gov.au/campaigns/labour-hire-licensing-reforms',
    publicRegister: true,
    answer:
      'Yes. South Australia operates a mandatory labour hire licensing scheme under the Labour Hire Licensing Act 2017 (SA), administered by Consumer and Business Services. From 29 January 2026 the scheme covers all labour hire providers across every sector, subject to a six-month transition, with penalties for unlicensed supply applying from 29 July 2026.',
    whoRegulates: [
      'The Labour Hire Licensing Act 2017 (SA) and the Labour Hire Licensing Regulations 2018 (SA) require labour hire providers to be licensed, administered by Consumer and Business Services.',
      'From 29 January 2026, amendments returned the Act to its original broad form: all labour hire providers and workers are covered, not only the five sectors previously specified (horticulture processing, meat processing, seafood processing, cleaning and trolley collection), subject to a six-month transition. From 29 July 2026, penalties apply to providers who operate without a licence and to anyone who engages an unlicensed provider.',
    ],
    crossBorder:
      'A provider supplying labour hire in South Australia must be licensed there, regardless of where the business is based. A business based in another state that supplies workers into South Australia needs a South Australian licence.',
    penaltiesRegister:
      'Host businesses must ensure their provider is licensed or risk penalties for using an unlicensed provider; you can check a provider’s licence through Consumer and Business Services.',
    sources: [
      {
        label: 'Consumer and Business Services — Labour hire licensing reforms',
        url: 'https://cbs.sa.gov.au/campaigns/labour-hire-licensing-reforms',
      },
      {
        label: 'SA.GOV.AU — Labour hire licensing',
        url: 'https://www.sa.gov.au/topics/business-and-trade/licensing/labour-hire',
      },
    ],
    faq: [
      {
        question: 'Do you need a labour hire licence in South Australia?',
        answer:
          'Yes. Under the Labour Hire Licensing Act 2017 (SA), labour hire providers must be licensed. From 29 January 2026 the scheme covers all providers across every sector, subject to a six-month transition.',
      },
      {
        question: 'When do penalties for unlicensed labour hire start in South Australia?',
        answer:
          'From 29 July 2026, penalties apply to providers who operate without a licence and to anyone who engages an unlicensed provider.',
      },
      {
        question: 'Who administers labour hire licensing in South Australia?',
        answer: 'Consumer and Business Services administers the scheme.',
      },
      {
        question: 'Does an interstate business need a South Australian licence?',
        answer:
          'Yes. A provider supplying labour hire in South Australia must be licensed there, regardless of where the business is based.',
      },
    ],
    related: ['victoria', 'western-australia'],
    metaTitle: 'Labour hire licence in South Australia: do you need one?',
    metaDescription:
      'Yes — South Australia runs a mandatory scheme under the Labour Hire Licensing Act 2017 (SA), now covering all sectors from 29 January 2026, administered by Consumer and Business Services.',
  },
  {
    slug: 'australian-capital-territory',
    state: 'Australian Capital Territory',
    abbr: 'ACT',
    hasScheme: true,
    act: 'Labour Hire Licensing Act 2020 (ACT)',
    regulator: 'WorkSafe ACT',
    regulatorUrl:
      'https://www.worksafe.act.gov.au/licensing-and-registration/labour-hire-licensing',
    publicRegister: true,
    answer:
      'Yes. The ACT operates a mandatory labour hire licensing scheme under the Labour Hire Licensing Act 2020 (ACT), administered by WorkSafe ACT, with a public register. A provider must be licensed before supplying labour hire in the ACT — expressly including providers based outside the ACT who supply workers into it.',
    whoRegulates: [
      'WorkSafe ACT administers the scheme under the Labour Hire Licensing Act 2020 (ACT). A labour hire provider must be licensed before it can provide labour hire services in the ACT.',
      'The scheme applies to providers based in the ACT, providers based in the ACT who hire out labour outside the ACT, and providers based outside the ACT who provide labour hire inside it.',
    ],
    crossBorder:
      'The ACT scheme expressly covers providers based outside the ACT who supply labour hire inside it. A business based in New South Wales that supplies workers into the ACT must hold an ACT licence.',
    penaltiesRegister:
      'Licensed providers appear on a public register available through WorkSafe ACT, which you can use to confirm a provider holds a current licence.',
    sources: [
      {
        label: 'WorkSafe ACT — Labour hire licensing',
        url: 'https://www.worksafe.act.gov.au/licensing-and-registration/labour-hire-licensing',
      },
      {
        label: 'Labour Hire Licensing Act 2020 (ACT)',
        url: 'https://www.legislation.act.gov.au/a/2020-21/',
      },
    ],
    faq: [
      {
        question: 'Do you need a labour hire licence in the ACT?',
        answer:
          'Yes. Under the Labour Hire Licensing Act 2020 (ACT) a provider must be licensed before supplying labour hire in the ACT, administered by WorkSafe ACT.',
      },
      {
        question: 'Does an interstate business need an ACT licence?',
        answer:
          'Yes. The ACT scheme expressly applies to providers based outside the ACT who supply labour hire inside it, so an interstate operator supplying workers into the ACT must hold an ACT licence.',
      },
      {
        question: 'Who administers labour hire licensing in the ACT?',
        answer: 'WorkSafe ACT administers the scheme and maintains a public register.',
      },
    ],
    related: ['new-south-wales', 'victoria'],
    metaTitle: 'Labour hire licence in the ACT: do you need one?',
    metaDescription:
      'Yes — the ACT runs a mandatory scheme under the Labour Hire Licensing Act 2020 (ACT), administered by WorkSafe ACT, expressly covering interstate providers supplying into the ACT.',
  },
  {
    slug: 'new-south-wales',
    state: 'New South Wales',
    abbr: 'NSW',
    hasScheme: false,
    answer:
      'No. As at June 2026, New South Wales does not operate a dedicated state labour hire licensing scheme. The NSW Government states there is currently no licensing scheme in NSW and that it is working with the Commonwealth and other states on a nationally consistent approach. But if you supply workers into Queensland, Victoria, South Australia or the ACT, you must hold that jurisdiction’s licence.',
    whoRegulates: [
      'There is no New South Wales labour hire licence to hold. The NSW Government has confirmed there is currently no licensing scheme in NSW, and that it is considering, with the Commonwealth and other states, the best approach to a nationally consistent framework.',
      'Labour hire in NSW is instead governed by general workplace and work health and safety law. SafeWork NSW sets out the work health and safety obligations that apply to labour hire arrangements.',
    ],
    crossBorder:
      'The absence of a NSW scheme does not exempt a NSW-based operator from other jurisdictions’ schemes. A NSW business supplying workers into Queensland, Victoria, South Australia or the ACT must hold that state’s or territory’s labour hire licence.',
    sources: [
      {
        label: 'NSW Government — Update on labour hire regulation',
        url: 'https://www.nsw.gov.au/employment/rights-responsibilities/starting-work/update-on-labour-hire-regulation',
      },
      {
        label: 'SafeWork NSW — Contractors and labour hire',
        url: 'https://www.safework.nsw.gov.au/legal-obligations/contractors-and-labour-hire',
      },
    ],
    faq: [
      {
        question: 'Do you need a labour hire licence in New South Wales?',
        answer:
          'No. As at June 2026 New South Wales has no dedicated state labour hire licensing scheme, so there is no NSW labour hire licence to hold.',
      },
      {
        question: 'If NSW has no scheme, do cross-border obligations still apply?',
        answer:
          'Yes. A NSW business that supplies workers into Queensland, Victoria, South Australia or the ACT must hold that jurisdiction’s labour hire licence — the requirement follows where the work is supplied.',
      },
      {
        question: 'How is labour hire regulated in NSW?',
        answer:
          'Through general workplace and work health and safety law. SafeWork NSW sets out the work health and safety obligations that apply to labour hire arrangements.',
      },
    ],
    related: ['queensland', 'victoria'],
    metaTitle: 'Labour hire licence in NSW: do you need one?',
    metaDescription:
      'No — New South Wales has no dedicated labour hire licensing scheme as at June 2026. But supplying workers into Queensland, Victoria, South Australia or the ACT requires that jurisdiction’s licence.',
  },
  {
    slug: 'western-australia',
    state: 'Western Australia',
    abbr: 'WA',
    hasScheme: false,
    answer:
      'No dedicated labour hire licensing scheme. Western Australia does not require a labour hire licence to supply temporary workers. A separate licence applies to employment agents under the Employment Agents Act 1976 (WA) — businesses that charge a fee to place people in work. If you supply workers into Queensland, Victoria, South Australia or the ACT, you still need that jurisdiction’s licence.',
    whoRegulates: [
      'Western Australia does not require a licence for labour hire — supplying short-term or temporary workers to a host business.',
      'A different regime applies to employment agents: under the Employment Agents Act 1976 (WA) you need an employment agent’s licence if you charge a fee to help people find work or to help businesses find employees. This is administered by Consumer Protection within the Department of Energy, Mines, Industry Regulation and Safety. It is not a labour hire licence.',
    ],
    crossBorder:
      'WA’s position does not change your obligations elsewhere. Supplying workers into a scheme jurisdiction — Queensland, Victoria, South Australia or the ACT — still requires that jurisdiction’s licence.',
    sources: [
      {
        label: 'WA Government — Employment agent’s licence',
        url: 'https://www.wa.gov.au/government/multi-step-guides/employment-agents-licence',
      },
      {
        label: 'Consumer Protection (DEMIRS) — Becoming an employment agent',
        url: 'https://www.commerce.wa.gov.au/consumer-protection/becoming-employment-agent',
      },
    ],
    faq: [
      {
        question: 'Do you need a labour hire licence in Western Australia?',
        answer:
          'No. WA does not require a labour hire licence to supply temporary workers. A separate employment agent’s licence applies under the Employment Agents Act 1976 (WA) to businesses that charge a fee to place people in work.',
      },
      {
        question: 'What is the difference between labour hire and an employment agent in WA?',
        answer:
          'Labour hire supplies temporary workers to a host and needs no WA licence. An employment agent charges a fee to match people with work and must be licensed under the Employment Agents Act 1976 (WA).',
      },
      {
        question: 'Does supplying into another state require a licence?',
        answer:
          'Yes. Supplying workers into Queensland, Victoria, South Australia or the ACT requires that jurisdiction’s labour hire licence, regardless of WA’s position.',
      },
    ],
    related: ['south-australia', 'northern-territory'],
    metaTitle: 'Labour hire licence in WA: do you need one?',
    metaDescription:
      'No labour hire licence in WA — but employment agents need one under the Employment Agents Act 1976 (WA). Supplying into QLD, VIC, SA or the ACT still requires that jurisdiction’s licence.',
  },
  {
    slug: 'tasmania',
    state: 'Tasmania',
    abbr: 'TAS',
    hasScheme: false,
    answer:
      'No. Tasmania does not operate a dedicated labour hire licensing scheme. Labour hire is regulated through general work health and safety law rather than a state licence. If you supply workers into Queensland, Victoria, South Australia or the ACT, you must hold that jurisdiction’s licence.',
    whoRegulates: [
      'There is no Tasmanian labour hire licence. As at June 2026, only four Australian jurisdictions operate a dedicated labour hire licensing scheme — Queensland, Victoria, South Australia and the ACT.',
      'In Tasmania, labour hire arrangements are governed by general work health and safety law. WorkSafe Tasmania sets out the duties that apply to host businesses and labour hire providers.',
    ],
    crossBorder:
      'A Tasmanian provider that supplies workers into Queensland, Victoria, South Australia or the ACT must hold that jurisdiction’s labour hire licence — the requirement follows where the work is supplied.',
    sources: [
      {
        label: 'WorkSafe Tasmania — Labour hire workers',
        url: 'https://worksafe.tas.gov.au/topics/Health-and-Safety/managing-safety/managing-people-in-your-workplace/labour-hire-workers',
      },
      FWO_SOURCE,
    ],
    faq: [
      {
        question: 'Do you need a labour hire licence in Tasmania?',
        answer:
          'No. As at June 2026 Tasmania has no dedicated labour hire licensing scheme; labour hire is regulated through general work health and safety law.',
      },
      {
        question: 'Which states require a labour hire licence?',
        answer:
          'As at June 2026, four jurisdictions operate a mandatory scheme: Queensland, Victoria, South Australia and the ACT.',
      },
      {
        question: 'Does a Tasmanian provider need a licence to supply interstate?',
        answer:
          'Yes. Supplying workers into Queensland, Victoria, South Australia or the ACT requires that jurisdiction’s labour hire licence.',
      },
    ],
    related: ['victoria', 'south-australia'],
    metaTitle: 'Labour hire licence in Tasmania: do you need one?',
    metaDescription:
      'No — Tasmania has no dedicated labour hire licensing scheme as at June 2026. But supplying workers into Queensland, Victoria, South Australia or the ACT requires that jurisdiction’s licence.',
  },
  {
    slug: 'northern-territory',
    state: 'Northern Territory',
    abbr: 'NT',
    hasScheme: false,
    answer:
      'No. The Northern Territory does not operate a dedicated labour hire licensing scheme. Labour hire is regulated through general work health and safety law rather than a territory licence. If you supply workers into Queensland, Victoria, South Australia or the ACT, you must hold that jurisdiction’s licence.',
    whoRegulates: [
      'There is no Northern Territory labour hire licence. As at June 2026, only Queensland, Victoria, South Australia and the ACT operate a dedicated labour hire licensing scheme.',
      'In the Northern Territory, labour hire arrangements are governed by general work health and safety law, administered by NT WorkSafe.',
    ],
    crossBorder:
      'An NT provider that supplies workers into Queensland, Victoria, South Australia or the ACT must hold that jurisdiction’s labour hire licence — the requirement follows where the work is supplied.',
    sources: [
      {
        label: 'NT WorkSafe — Definition of a worker',
        url: 'https://worksafe.nt.gov.au/forms-and-resources/bulletins/definition-of-a-worker',
      },
      FWO_SOURCE,
    ],
    faq: [
      {
        question: 'Do you need a labour hire licence in the Northern Territory?',
        answer:
          'No. As at June 2026 the Northern Territory has no dedicated labour hire licensing scheme; labour hire is regulated through general work health and safety law.',
      },
      {
        question: 'Which jurisdictions require a labour hire licence?',
        answer:
          'As at June 2026, four operate a mandatory scheme: Queensland, Victoria, South Australia and the ACT.',
      },
      {
        question: 'Does an NT provider need a licence to supply interstate?',
        answer:
          'Yes. Supplying workers into Queensland, Victoria, South Australia or the ACT requires that jurisdiction’s labour hire licence.',
      },
    ],
    related: ['south-australia', 'queensland'],
    metaTitle: 'Labour hire licence in the NT: do you need one?',
    metaDescription:
      'No — the Northern Territory has no dedicated labour hire licensing scheme as at June 2026. But supplying workers into Queensland, Victoria, South Australia or the ACT requires that jurisdiction’s licence.',
  },
];

export function getStateBySlug(slug: string): StateLicence | undefined {
  return LICENCE_STATES.find((s) => s.slug === slug);
}

export function licenceStatePath(slug: string): string {
  return `${LICENCE_HUB_PATH}/${slug}`;
}
