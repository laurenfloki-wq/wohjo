// FLOSTRUCTION /command — guilloché path math.
//
// Pure-function utilities for the security-print rosette: deterministic
// from a SHA-256 hex string. Used both by <Guilloche /> (rendered as a
// stand-alone SVG) and inline by surfaces (PackSeal, ReceiptDrawer)
// that need to embed the path inside their own SVG so layer order
// works without z-index gymnastics.

export interface RosetteParams {
  R: number;
  r: number;
  d: number;
  rotations: number;
  rotateDeg: number;
}

/**
 * Bytes pulled from the hex string — cycles to fill `count` so a
 * shorter seed (rare) still produces output.
 */
export function seedBytes(seed: string | null | undefined, count: number): number[] {
  const base = ((seed ?? '').replace(/[^0-9a-f]/gi, '').toLowerCase()) || '0';
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const h = base[(i * 2) % base.length] + base[((i * 2) + 1) % base.length];
    out.push(parseInt(h, 16));
  }
  return out;
}

/** Map a hex seed + intended outer radius to a sensible rosette parameter set. */
export function rosetteParamsFromSeed(
  seed: string | null | undefined,
  outerRadius: number,
): RosetteParams {
  const b = seedBytes(seed, 8);
  const R = outerRadius;
  const r = Math.max(3, 8 + (b[0] % 8));                 // 8..15
  const d = Math.max(2, outerRadius * (0.35 + (b[1] % 30) / 100)); // 0.35..0.64
  const rotations = 10 + (b[2] % 8);                     // 10..17
  const rotateDeg = (b[3] / 255) * 360;
  return { R, r, d, rotations, rotateDeg };
}

/**
 * Hypotrochoid: a point at distance d from the centre of a small circle of
 * radius r rolling inside a large circle of radius R. Sample uniformly
 * over `rotations` full turns; cx/cy translates the rosette to its
 * centre on the SVG canvas.
 */
export function hypotrochoidPath(opts: {
  R: number;
  r: number;
  d: number;
  cx: number;
  cy: number;
  rotations: number;
  samples?: number;
  rotateDeg?: number;
}): string {
  const { R, r, d, cx, cy, rotations, samples = 220, rotateDeg = 0 } = opts;
  const total = Math.max(64, Math.floor(samples * rotations));
  const phi = (rotateDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const tMax = 2 * Math.PI * rotations;
  const k = R - r;
  let dPath = '';
  for (let i = 0; i <= total; i++) {
    const t = (i / total) * tMax;
    const x0 = k * Math.cos(t) + d * Math.cos((k * t) / r);
    const y0 = k * Math.sin(t) - d * Math.sin((k * t) / r);
    const x = cx + x0 * cosPhi - y0 * sinPhi;
    const y = cy + x0 * sinPhi + y0 * cosPhi;
    dPath += i === 0 ? `M${x.toFixed(2)},${y.toFixed(2)}` : `L${x.toFixed(2)},${y.toFixed(2)}`;
  }
  return dPath;
}

/** Convenience — full rosette path centred at cx/cy with `outerRadius` extent, seeded from hex. */
export function rosettePathFromSeed(
  seed: string | null | undefined,
  cx: number,
  cy: number,
  outerRadius: number,
  samples = 220,
): string {
  if (!seed) return '';
  const p = rosetteParamsFromSeed(seed, outerRadius);
  return hypotrochoidPath({
    R: p.R, r: p.r, d: p.d, cx, cy,
    rotations: p.rotations, rotateDeg: p.rotateDeg, samples,
  });
}
