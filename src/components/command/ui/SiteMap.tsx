// FLOSTRUCTION /command — SiteMap thumbnail.
// A small inline SVG render of a site's geofence circle on a soft grid
// background. Reinforces the spatial-truth claim without pulling in a
// third-party tile vendor (no third-party calls = no privacy surface).
// If lat/lng/radius are missing, falls back to an em-dash.

interface Props {
  lat: number | null | undefined;
  lng: number | null | undefined;
  radiusMetres: number | null | undefined;
  size?: number;
}

export function SiteMap({ lat, lng, radiusMetres, size = 72 }: Props) {
  if (lat == null || lng == null || radiusMetres == null) {
    return <span style={{ color: 'var(--ink-muted)' }}>—</span>;
  }
  // Render a stylised cell: the dot is the site, the ring is the geofence.
  // We don't render a literal map (it would require a 3rd-party tile call).
  // The circle's relative radius is normalised to a soft visual band so
  // the thumbnail communicates "geofence exists & sized" without
  // pretending to be geographic.
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 2;
  const minR = 8;
  // map 50..1000m to minR..maxR linearly
  const r = Math.max(minR, Math.min(maxR, minR + ((radiusMetres - 50) / 950) * (maxR - minR)));
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Geofence ${radiusMetres} metres around ${lat.toFixed(4)}, ${lng.toFixed(4)}`}
      style={{ display: 'block', borderRadius: 6 }}
    >
      <rect x={0} y={0} width={size} height={size} fill="var(--surface-sunken)" />
      {Array.from({ length: 5 }).map((_, i) => (
        <line key={`h${i}`} x1={0} x2={size} y1={(i + 1) * (size / 6)} y2={(i + 1) * (size / 6)} stroke="var(--border)" strokeWidth={0.5} />
      ))}
      {Array.from({ length: 5 }).map((_, i) => (
        <line key={`v${i}`} x1={(i + 1) * (size / 6)} x2={(i + 1) * (size / 6)} y1={0} y2={size} stroke="var(--border)" strokeWidth={0.5} />
      ))}
      <circle cx={cx} cy={cy} r={r} fill="var(--accent-bg)" stroke="var(--accent)" strokeWidth={1.2} />
      <circle cx={cx} cy={cy} r={2.4} fill="var(--accent)" />
    </svg>
  );
}
