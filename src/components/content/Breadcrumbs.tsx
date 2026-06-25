// Visible breadcrumb trail + matching BreadcrumbList JSON-LD, built from
// one list of crumbs so the two can't disagree. The final crumb is the
// current page (rendered as plain text, not a link).

import Link from 'next/link';
import { JsonLd, breadcrumbSchema, type Crumb } from '@/lib/seo/jsonld';

export function Breadcrumbs({
  crumbs,
  schema = true,
}: {
  crumbs: Crumb[];
  /** Emit BreadcrumbList JSON-LD. Set false when the page emits it verbatim. */
  schema?: boolean;
}) {
  return (
    <>
      {schema && <JsonLd data={breadcrumbSchema(crumbs)} />}
      <nav className="crumb" aria-label="Breadcrumb">
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <span key={c.path}>
              {i > 0 && <span className="sep">/</span>}
              {isLast ? <span>{c.name}</span> : <Link href={c.path}>{c.name}</Link>}
            </span>
          );
        })}
      </nav>
    </>
  );
}

export default Breadcrumbs;
