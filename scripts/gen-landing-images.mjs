// One-off: generate optimised, responsive derivatives of the FLOSMOSIS-owned
// landing photos. Source PNGs (1.2-1.9 MB each) live in public/images/source/
// (gitignored); committed derivatives go to public/images/. Re-run after
// replacing a source. Run from the repo root: `node scripts/gen-landing-images.mjs`.
import sharp from 'sharp';

const SRC = 'public/images/source';
const OUT = 'public/images';

// [file, widths[], quality] — widths never exceed native long edge.
const JOBS = [
  ['hero_worker_16x9.png', [1456, 960, 640], 70],
  ['hero_crew_16x9.png', [1456, 960, 640], 70],
  ['persona_office_4x5.png', [960, 640], 72],
  ['persona_worker_4x5.png', [960, 640], 72],
];

for (const [file, widths, q] of JOBS) {
  const base = file.replace('.png', '');
  for (const w of widths) {
    await sharp(`${SRC}/${file}`)
      .resize({ width: w })
      .webp({ quality: q })
      .toFile(`${OUT}/${base}-${w}.webp`);
    await sharp(`${SRC}/${file}`)
      .resize({ width: w })
      .avif({ quality: q - 8 })
      .toFile(`${OUT}/${base}-${w}.avif`);
  }
  // JPG fallback at the largest width.
  await sharp(`${SRC}/${file}`)
    .resize({ width: widths[0] })
    .jpeg({ quality: 76, mozjpeg: true })
    .toFile(`${OUT}/${base}-${widths[0]}.jpg`);
  console.log('generated', base, widths.join('/'));
}
console.log('done');
