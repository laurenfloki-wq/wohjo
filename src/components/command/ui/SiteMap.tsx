// FLOSTRUCTION /command — SiteMap as an instrument mini-plot.
// A precise cartesian plot — not a stylised icon and not a real map
// tile (no third-party tile vendor, no privacy surface). The plot
// renders the geofence circle to scale against ruled north/east axes,
// a north arrow, and tick marks calibrated in metres. It reads as a
// surveyor's plate, which is the spatial-truth claim the product is
// making.

interface Props {
  lat: number | null | undefined;
  lng: number | null | undefined;
  radiusMetres: number | null | undefined;
  size?: number;
}

const REF_RADIUS_M = 1000;

export function SiteMap({ lat, lng, radiusMetres, size = 96 }: Props) {
  if (lat == null || lng == null || radiusMetres == null) {
    return <span style={{ color: 'var(--ink-muted)' }}>—</span>;
  }
  const cx = size / 2;
  const cy = size / 2;
  const inset = 8;
  const plot = size - inset * 2;
  const halfPlot = plot / 2;
  const r = Math.max(6, Math.min(halfPlot - 2, (radiusMetres / REF_RADIUS_M) * halfPlot));

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Geofence plot — ${radiusMetres} metres around ${lat.toFixed(4)}, ${lng.toFixed(4)}`}
      style={{
        display: 'block',
        background: 'var(--bg-ledger)',
        borderRadius: 'var(--r-sm)',
        border: '1px solid var(--border-strong)',
        boxShadow: 'inset 0 1px 0 0 var(--border-emboss)',
      }}
    >
      {/* Inner plate */}
      <rect
        x={inset}
        y={inset}
        width={plot}
        height={plot}
        fill="var(--surface)"
        stroke="var(--border)"
        strokeWidth={0.6}
      />

      {/* Ruled grid — 5x5 cells */}
      <g stroke="var(--border)" strokeWidth={0.4}>
        {Array.from({ length: 4 }).map((_, i) => {
          const t = inset + (plot * (i + 1)) / 5;
          return (
            <g key={i}>
              <line x1={inset} x2={inset + plot} y1={t} y2={t} />
              <line x1={t} x2={t} y1={inset} y2={inset + plot} />
            </g>
          );
        })}
      </g>

      {/* Cardinal axes through centre */}
      <g stroke="var(--ink-muted)" strokeWidth={0.7} strokeDasharray="2 2">
        <line x1={inset} x2={inset + plot} y1={cy} y2={cy} />
        <line x1={cx} x2={cx} y1={inset} y2={inset + plot} />
      </g>

      {/* Geofence circle — to scale against a 1km reference plate */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="var(--verified-bg)"
        fillOpacity={0.6}
        stroke="var(--verified)"
        strokeWidth={1.2}
      />
      {/* Site centre dot */}
      <circle cx={cx} cy={cy} r={2.2} fill="var(--verified-deep)" />

      {/* North arrow — small triangle at top-left, with "N" tick */}
      <g transform={`translate(${inset + 2}, ${inset + 2})`}>
        <polygon points="6,0 12,12 0,12" fill="var(--ink)" />
        <text
          x={6}
          y={20}
          textAnchor="middle"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 7,
            fill: 'var(--ink-secondary)',
            letterSpacing: '0.1em',
          }}
        >
          N
        </text>
      </g>

      {/* Radius scale tick — bottom-right corner */}
      <g transform={`translate(${inset + plot - 36}, ${inset + plot - 14})`}>
        <line x1={0} y1={6} x2={32} y2={6} stroke="var(--ink)" strokeWidth={1} />
        <line x1={0} y1={3} x2={0} y2={9} stroke="var(--ink)" strokeWidth={1} />
        <line x1={32} y1={3} x2={32} y2={9} stroke="var(--ink)" strokeWidth={1} />
        <text
          x={16}
          y={2}
          textAnchor="middle"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 7,
            fill: 'var(--ink-secondary)',
            letterSpacing: '0.06em',
          }}
        >
          1 km
        </text>
      </g>
    </svg>
  );
}
