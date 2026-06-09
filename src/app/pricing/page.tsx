import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { landingRootVars } from '@/styles/landing-tokens';

// DRAFT pricing page (§11) — NOT published.
//
// Gated behind an env flag so it 404s in every environment by default and
// is reachable only when NEXT_PUBLIC_PRICING_PUBLISHED === 'true'. It is
// not linked from anywhere on the site. Per the brief, go-live is Lauren's
// decision and is blocked until: (a) public pricing is confirmed not to
// compromise founding-customer / trial terms, and (b) every listed feature
// is actually shipped. Tiers below are the director-resolution figures
// (Starter AUD 99 / Growth AUD 299 / Enterprise custom); feature
// allocation is intentionally minimal and names only shipped core
// capability — no unbuilt features advertised.

export const metadata: Metadata = {
  title: 'FLOSTRUCTION — pricing (draft)',
  robots: { index: false, follow: false },
};

const PUBLISHED = process.env.NEXT_PUBLIC_PRICING_PUBLISHED === 'true';

// Compliance copy, single-line literals (verbatim, grep-verifiable).
const SCOPE_STATEMENT =
  'Flostruction is a workforce time verification platform. It does not calculate wages, award entitlements, tax, or superannuation.';
const ENTITY_LINE = '© 2026 FLOSMOSIS PTY LTD (ACN 697 323 925).';

const CORE = [
  'Verified clock-in and clock-out',
  'Supervisor approval by SMS',
  'WLES-sealed, tamper-evident records',
  'CSV export for your payroll provider',
];

const TIERS = [
  { name: 'Starter', price: 'AUD 99', unit: '/ month', note: 'Single crew, one site.' },
  {
    name: 'Growth',
    price: 'AUD 299',
    unit: '/ month',
    note: 'Multiple crews and sites.',
    featured: true,
  },
  { name: 'Enterprise', price: 'Custom', unit: '', note: 'Large operations and bespoke needs.' },
];

export default function PricingPage() {
  if (!PUBLISHED) notFound();

  return (
    <div className="pricing">
      <style>{`
        :root {${landingRootVars}}
        .pricing { font-family: var(--font-barlow), 'Barlow', sans-serif; color: var(--ink); background: var(--paper); min-height: 100vh; padding: clamp(48px, 8vw, 110px) var(--gutter); }
        .pricing * { box-sizing: border-box; }
        .pricing .draft { max-width: var(--maxw); margin: 0 auto 28px; background: var(--signal); color: #fff; border-radius: 10px; padding: 12px 18px; font-weight: 700; font-size: 0.85rem; letter-spacing: 0.04em; text-transform: uppercase; text-align: center; }
        .pricing .head { max-width: 720px; margin: 0 auto clamp(40px, 6vw, 72px); text-align: center; }
        .pricing h1 { font-family: var(--font-barlow-condensed), sans-serif; font-size: var(--step-4); font-weight: 800; text-transform: uppercase; letter-spacing: -0.01em; line-height: 1.05; }
        .pricing .sub { font-size: var(--step-1); color: var(--muted); margin-top: 14px; line-height: 1.5; }
        .pricing .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; max-width: var(--maxw); margin: 0 auto; }
        .pricing .tier { background: #fff; border: 1px solid var(--border); border-radius: var(--radius); padding: 34px 30px; box-shadow: 0 1px 3px rgba(26,20,16,0.05), 0 12px 30px -16px rgba(26,20,16,0.12); }
        .pricing .tier.featured { border-color: var(--signal); box-shadow: 0 1px 3px rgba(200,83,10,0.12), 0 18px 40px -16px rgba(200,83,10,0.25); }
        .pricing .tier h2 { font-family: var(--font-barlow-condensed), sans-serif; font-size: 1.5rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
        .pricing .price { font-family: var(--font-barlow-condensed), sans-serif; font-size: 2.6rem; font-weight: 800; margin-top: 12px; }
        .pricing .price .unit { font-size: 1rem; font-weight: 500; color: var(--muted); }
        .pricing .tier .note { color: var(--muted); font-size: 0.92rem; margin-top: 6px; }
        .pricing ul { list-style: none; padding: 0; margin: 22px 0 0; display: grid; gap: 10px; }
        .pricing li { display: flex; gap: 10px; align-items: flex-start; font-size: 0.95rem; color: var(--ink); }
        .pricing li svg { flex-shrink: 0; margin-top: 3px; color: var(--forest); }
        .pricing .fine { max-width: 720px; margin: clamp(40px, 6vw, 64px) auto 0; text-align: center; color: var(--muted); font-size: 0.85rem; line-height: 1.6; }
        @media (max-width: 820px) { .pricing .grid { grid-template-columns: 1fr; } }
      `}</style>

      <div className="draft">
        Draft — not published. Pricing and feature allocation pending director sign-off.
      </div>

      <div className="head">
        <h1>Pricing</h1>
        <p className="sub">
          Verified hours for construction and labour hire. Every plan includes the same evidentiary
          core; tiers scale with the size of your operation.
        </p>
      </div>

      <div className="grid">
        {TIERS.map((t) => (
          <div className={`tier${t.featured ? ' featured' : ''}`} key={t.name}>
            <h2>{t.name}</h2>
            <div className="price">
              {t.price}
              {t.unit && <span className="unit"> {t.unit}</span>}
            </div>
            <div className="note">{t.note}</div>
            <ul>
              {CORE.map((f) => (
                <li key={f}>
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M5 12l5 5 9-11"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="fine">
        {SCOPE_STATEMENT} {ENTITY_LINE}
      </p>
    </div>
  );
}
