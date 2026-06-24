// Visible author byline carrying credentials and the published (and, when
// it differs, updated) date — the on-page half of the E-E-A-T signal whose
// machine-readable half is the Article schema's Person author.

import { AUTHOR } from '@/lib/seo/site';

export function formatDate(iso: string): string {
  // en-AU long date, e.g. "24 June 2026".
  const [y, m, d] = iso.split('-').map(Number);
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return `${d} ${months[m - 1]} ${y}`;
}

export function AuthorByline({ published, modified }: { published: string; modified: string }) {
  const updated = modified && modified !== published;
  return (
    <div className="byline">
      <span className="who">{AUTHOR.name}</span>
      <span className="cred">{AUTHOR.credential}</span>
      <span className="date">
        Published {formatDate(published)}
        {updated ? ` · Updated ${formatDate(modified)}` : ''}
      </span>
    </div>
  );
}

export default AuthorByline;
