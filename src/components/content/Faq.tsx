// FAQ: one `items` array drives both the visible <details> accordion and
// the FAQPage JSON-LD, so the structured data Google lifts always matches
// the questions on the page exactly (a Rich Results requirement).

import { JsonLd, faqPageSchema, type FaqItem } from '@/lib/seo/jsonld';

export type { FaqItem };

/** Emits only the FAQPage JSON-LD (no visible markup). */
export function FaqSchema({ items }: { items: FaqItem[] }) {
  return <JsonLd data={faqPageSchema(items)} />;
}

/** Visible accordion + matching FAQPage schema. */
export function Faq({
  items,
  heading = 'Frequently asked questions',
  schema = true,
}: {
  items: FaqItem[];
  heading?: string;
  /** Emit FAQPage JSON-LD. Set false when the page emits it verbatim. */
  schema?: boolean;
}) {
  return (
    <>
      {schema && <FaqSchema items={items} />}
      <h2>{heading}</h2>
      <div className="faq">
        {items.map((it) => (
          <details key={it.question}>
            <summary>{it.question}</summary>
            <p>{it.answer}</p>
          </details>
        ))}
      </div>
    </>
  );
}

export default Faq;
