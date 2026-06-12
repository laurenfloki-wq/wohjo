// FLOSTRUCTION operator surface — warm-light page paradigm tokens.
// Directors' decision 12 June 2026: warm paper supersedes the 4 May
// charcoal canon on the operator surface. Navy remains the marketing
// temperature. These values are acceptance criteria, not suggestions —
// page-tokens.contrast.test.ts enforces WCAG 4.5:1 on every text pair
// and pins decorative-only / failure-only colour roles.
export const PAGE_TOKENS = {
  paper: '#F7F4EC',
  paperRaise: '#FFFEF9',
  paperHover: '#F1ECDF',
  railBg: '#F2EEE2',
  ink: '#1F1B14',
  ink70: '#4A443A',
  ink50: '#6E6657',
  ink35: '#786D56', // never lighter than this for text
  rule: '#E5DECD',
  rule2: '#D7CFBA',
  green: '#166534',
  greenSoft: '#1E7A40',
  amber: '#D9A548', // decorative only — never a text colour
  amberInk: '#8A6116',
  navy: '#0E1C2F', // marketing temperature + primary action fill only
  navySoft: '#15243A',
  red: '#B5402F', // reserved exclusively for genuine verification failure
  redWash: '#F8E7E2',
  selection: '#EADFC4',
} as const;

export type PageTokenName = keyof typeof PAGE_TOKENS;

/** Every foreground/background pair the operator surface renders as text.
 *  The contrast test asserts >= 4.5:1 for each. Add the pair here BEFORE
 *  using a new combination in operator.css. */
export const TEXT_PAIRS: ReadonlyArray<{
  fg: PageTokenName;
  bg: PageTokenName;
  usage: string;
}> = [
  { fg: 'ink', bg: 'paper', usage: 'body text on the page' },
  { fg: 'ink', bg: 'paperRaise', usage: 'body text on the elevated card' },
  { fg: 'ink', bg: 'paperHover', usage: 'row text on hover' },
  { fg: 'ink', bg: 'railBg', usage: 'active rail icon' },
  { fg: 'ink70', bg: 'paper', usage: 'secondary prose' },
  { fg: 'ink70', bg: 'paperRaise', usage: 'secondary prose on card' },
  { fg: 'ink70', bg: 'paperHover', usage: 'secondary prose on hover' },
  { fg: 'ink50', bg: 'paper', usage: 'metadata' },
  { fg: 'ink50', bg: 'railBg', usage: 'rail icons at rest' },
  { fg: 'ink35', bg: 'paper', usage: 'whisper text — floor of the scale' },
  { fg: 'ink35', bg: 'paperRaise', usage: 'whisper text on card' },
  { fg: 'green', bg: 'paper', usage: 'safe word, sealed states' },
  { fg: 'green', bg: 'paperRaise', usage: 'sealed counts on the pay run card' },
  { fg: 'greenSoft', bg: 'paper', usage: 'soft sealed accents' },
  { fg: 'amberInk', bg: 'paper', usage: 'in-motion counts' },
  { fg: 'amberInk', bg: 'paperRaise', usage: 'in-motion counts on card' },
  { fg: 'red', bg: 'paper', usage: 'verification failure only' },
  { fg: 'red', bg: 'redWash', usage: 'held record row' },
  { fg: 'paper', bg: 'navy', usage: 'primary action button label' },
  { fg: 'paper', bg: 'navySoft', usage: 'primary action button hover' },
  { fg: 'ink', bg: 'selection', usage: 'text selection' },
];

/** Colours that must never appear as a text foreground. */
export const DECORATIVE_ONLY: ReadonlyArray<PageTokenName> = ['amber'];
