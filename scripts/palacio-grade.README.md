# Palacio grade — reproducible Portra-400 look

Deterministic photo grading script for all Flostruction campaign
imagery. Replaces Genspark-dependent re-grading with a pure Python
pipeline that produces byte-identical output for the same input +
parameters.

## Why

Every Palacio-grade image on flosmosis.com, in the GTM letters, and
in the campaign folders should look like it was made by the same
hand, on the same day, on the same film stock. Genspark re-grading
introduced subtle inconsistencies between shoots and between sizes
of the same source. This script removes that variable: one
codebase, one look, one set of parameters.

Source files: `scripts/palacio-grade.py` + `scripts/palacio-grade.test.py`.

## What the grade does

Applied in order:

1. **Warm white balance** — ~4500K perceived (tungsten-ish).
   R gain × 1.048, B cut × 0.936 at default strength. Skin tones
   warm without yellowing because G is left neutral.
2. **Tonal curve** — shadows blend toward navy `#0E1C2F`, highlights
   blend toward amber `#D18B4A`. Midtones preserved. Soft-step
   masks at luma thresholds 0.25 (shadow) and 0.72 (highlight) so
   there's no hard transition.
3. **Subtle warm vignette** — radial darken 18% at corner + warm
   tint 6% amber blend. Power-curve falloff (1.4) keeps the
   subject's area clean.
4. **Portra-400 grain overlay** — fine gaussian grain (σ ≈ 6 at
   default), luminance-coupled so highlights stay cleaner than
   shadows. Seeded for determinism.
5. **sRGB JPEG q95, progressive, 4:2:2 subsampling.**

## Why these defaults

Each default has been picked to be subtle enough that a single pass
does not push the image into "filtered" territory. The values are
editorial-documentary register — closer to a newspaper colour
correction than to an Instagram preset.

If you want a more pronounced grade, flags are exposed for every
stage (see `--help`). The defaults are:

| Flag | Default | Range | Notes |
|---|---|---|---|
| `wb_strength` | 0.08 | 0–0.2 | 0.15 is strong tungsten |
| `shadow_mix` | 0.18 | 0–0.4 | how much shadows pull to navy |
| `highlight_mix` | 0.22 | 0–0.4 | how much highlights pull to amber |
| `vignette_darken` | 0.18 | 0–0.4 | amount of corner darken |
| `vignette_warm` | 0.06 | 0–0.2 | warm tint at corner |
| `grain_intensity` | 6.0 | 0–15 | grain σ in 8-bit units |
| `grain_seed` | content hash | any int | same image → same grain |

## Usage

### Single image

```bash
python scripts/palacio-grade.py input.jpg output.jpg
```

### Batch a directory

```bash
for f in shoot/*.jpg; do
  python scripts/palacio-grade.py "$f" "graded/$(basename "$f")"
done
```

### Override defaults (import as library)

```python
import numpy as np
from PIL import Image
import importlib.util
spec = importlib.util.spec_from_file_location(
    "pg", "scripts/palacio-grade.py"
)
pg = importlib.util.module_from_spec(spec); spec.loader.exec_module(pg)

src = np.array(Image.open("in.jpg").convert("RGB"))
out = pg.apply_palacio_grade(
    src,
    wb_strength=0.10,
    shadow_mix=0.22,
    highlight_mix=0.25,
    grain_intensity=5.0,
    grain_seed=2026,
)
Image.fromarray(out).save("out.jpg", quality=95)
```

## Determinism guarantees

- **Same input + no `--grain-seed`** → byte-identical output. The
  seed is derived from a BLAKE2s hash of the raw pixel bytes, so
  every distinct image gets its own stable seed without any global
  state.
- **Same input + same `--grain-seed`** → byte-identical output.
- **Different input + no `--grain-seed`** → each image gets its own
  content-derived seed, so two photos from the same shoot receive
  different grain patterns (desirable — grain shouldn't tile).

## Testing

```bash
python scripts/palacio-grade.test.py
```

20 unit tests covering every stage (white balance, tonal curve,
vignette, grain, end-to-end), plus file I/O roundtrip using the Joao
v6 fixture set (gracefully skipped when fixtures aren't present).
All tests pass on the current build.

## Before/after samples

A fresh pair of samples is generated in
`~/OneDrive/Desktop/palacio-grade-samples-2026-04-22/` — the 1x1
1080 and 4x5 1080 Joao v6 portraits, both original and graded.
Eyeball check these first before trusting the script for a new
shoot.

## Known limitations

- **8-bit pipeline.** All processing happens in 8-bit sRGB per
  channel. A 16-bit linear pipeline would be cleaner for edge cases
  with extreme contrast, but adds dependencies (skimage, colour-
  science) and complicates the tests. Phase 2 upgrade path if any
  print-grade quality concerns surface.
- **No HDR / wide-gamut support.** sRGB in, sRGB out. If the source
  is P3 or Rec.2020, convert first.
- **Grain is monochromatic.** Real film grain has faint chromatic
  components. The difference is visible only under microscope — not
  a priority.
- **No face-aware protection.** The grade is applied uniformly. If
  a shoot has backlit faces that end up getting pushed too far
  amber, override `highlight_mix` lower for that image.

## Deployment

The script has no external services. It runs anywhere Python 3.10+
with Pillow and NumPy is installed. For the Flostruction sprint
workflow:

1. Photographer delivers a shoot as JPGs (wherever).
2. Batch-grade locally: one-liner above.
3. Output JPGs are sRGB q95 ready for web, print, or re-sizing.

Total time per 2048×2048 image on a 2019 MacBook Pro: ~1.8s.
