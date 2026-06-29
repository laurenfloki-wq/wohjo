// Exposure Check masthead — the route's own restrained brand header, in the
// command-light language. Replaces the generic editorial ContentHeader on this
// surface. A small geometric "F" monogram (inline SVG, token-coloured via CSS
// classes — no bitmap, no gradient) locked up with the FLOSTRUCTION wordmark in
// Inter, plus a quiet primary nav. Left edge aligns to the --page-max content
// column via .flos-content. Server component: no interactivity.

import Link from 'next/link';

/** Three-bar "F" monogram, drawn from tokens (.exp-mark-* fills in CSS). */
function ExposureMark() {
  return (
    <svg
      className="exp-mark"
      width="26"
      height="26"
      viewBox="0 0 24 24"
      role="img"
      aria-label="FLOSTRUCTION"
      focusable="false"
    >
      <rect className="exp-mark-tile" x="0" y="0" width="24" height="24" rx="6" />
      <rect className="exp-mark-bar" x="6" y="5.5" width="2.6" height="13" rx="1" />
      <rect className="exp-mark-bar" x="6" y="5.5" width="12" height="2.6" rx="1" />
      <rect className="exp-mark-bar" x="6" y="10.7" width="8.5" height="2.6" rx="1" />
    </svg>
  );
}

export function ExposureMasthead() {
  return (
    <header className="exp-masthead">
      <div className="flos-content">
        <div className="exp-mast">
          <Link href="/" className="exp-brand" aria-label="FLOSTRUCTION home">
            <ExposureMark />
            <span className="exp-wordmark">FLOSTRUCTION</span>
            <span className="exp-wordmark-tag">Time Verification</span>
          </Link>
          <nav className="exp-nav" aria-label="Primary">
            <Link href="/">Home</Link>
            <Link href="/wles">The standard</Link>
            <Link href="/guides">Guides</Link>
          </nav>
        </div>
      </div>
    </header>
  );
}

export default ExposureMasthead;
