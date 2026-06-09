// Hash ribbon — flostruction-v5.html:635 (markup) + 762-771 (cells).
// Deterministic seeded PRNG (seed 7, Lehmer LCG) so the server render
// and client hydration produce identical hashes. Server component —
// no interactivity; the ticker is pure CSS.
const IDS = ['FSTR-7P2K9Q', 'FSTR-3K1M2A', 'FSTR-QR88TX', 'FSTR-XY12BD', 'FSTR-MN77KC', 'FSTR-AB45HG'];
const HEX = 'abcdef0123456789';

function buildCells(): { id: string; hash: string }[] {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const h = (n: number) => Array.from({ length: n }, () => HEX[Math.floor(rnd() * 16)]).join('');
  return IDS.map((id) => ({ id, hash: h(12) }));
}

export function HashRibbon() {
  const cells = buildCells();
  const doubled = [...cells, ...cells]; /* strip repeats once for the seamless loop */
  return (
    <div className="ribbon" aria-hidden="true">
      <div className="strip">
        {doubled.map((c, i) => (
          <span key={i}>{c.id} · sha-256 {c.hash}… · <b>WLES SEALED</b></span>
        ))}
      </div>
    </div>
  );
}
