#!/usr/bin/env python3
"""Palacio grade — deterministic Portra-400-inspired photo grading.

Applied in this order:
  1. Warm white balance (~4500K perceived)        -- tungsten-ish shift
  2. Tonal curve: deepened cool shadows, amber highlights (#D18B4A)
  3. Subtle warm vignette
  4. Portra-400 grain overlay (seeded, reproducible)
  5. Re-encode to sRGB JPG quality 95

Design goals:
  - Deterministic: same input image + same params = byte-identical PNG
    pixel output before JPG encoding. Seeded grain is the only random
    component; the seed is derived from the image content so the
    script is idempotent per-image without ever relying on a global
    RNG.
  - Pure Python + PIL + numpy, no external services.
  - Easy to unit test: every stage is a function that takes + returns
    a numpy ndarray of shape (H, W, 3) uint8.

Usage:
    python scripts/palacio-grade.py INPUT.jpg OUTPUT.jpg
    python scripts/palacio-grade.py --help

Example (batch a folder):
    for f in shoot/*.jpg; do
      python scripts/palacio-grade.py "$f" "graded/$(basename "$f")"
    done

See scripts/palacio-grade.README.md for the colour-science reasoning
and how to tweak the look for future campaigns.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path
from typing import Tuple

import numpy as np
from PIL import Image

# ---------------------------------------------------------------------
# Palette — Flostruction campaign tokens
# ---------------------------------------------------------------------

# Amber highlight target — B3 accent colour from the /field redesign.
AMBER_RGB = (0xD1, 0x8B, 0x4A)  # == (209, 139, 74)

# Navy shadow toner — used for the cool-shadow shift. The shadows are
# pulled slightly toward deep navy/blue, NOT pitch black, which is
# what gives the Palacio look its cinematic quality.
NAVY_RGB = (0x0E, 0x1C, 0x2F)  # == (14, 28, 47)


# ---------------------------------------------------------------------
# Stage helpers (pure, numpy-only)
# ---------------------------------------------------------------------

def warm_white_balance(img: np.ndarray, strength: float = 0.08) -> np.ndarray:
    """Shift the white balance warm — toward ~4500K perceived.

    Gentle R gain, gentle B cut. `strength` is a fraction 0..1.
    A value of 0.08 is subtle; 0.15 is strong tungsten.
    """
    assert img.dtype == np.uint8 and img.ndim == 3
    f = img.astype(np.float32)
    f[..., 0] *= (1.0 + strength * 0.6)  # R up
    f[..., 2] *= (1.0 - strength * 0.8)  # B down
    # Keep G roughly neutral so mid-tone skin doesn't turn yellow.
    return np.clip(f, 0, 255).astype(np.uint8)


def tonal_curve(
    img: np.ndarray,
    shadow_mix: float = 0.18,
    highlight_mix: float = 0.22,
    shadow_threshold: float = 0.25,
    highlight_threshold: float = 0.72,
) -> np.ndarray:
    """Blend shadows toward cool navy and highlights toward warm amber.

    `shadow_threshold` and `highlight_threshold` are luma 0..1 cutoffs
    for a soft-step mask. `*_mix` is the blend weight at the extreme
    end of the mask. A pixel at luma 0 is fully mixed with navy at
    `shadow_mix`; a pixel at luma 1 is fully mixed with amber at
    `highlight_mix`. Mid-tones are left alone.
    """
    assert img.dtype == np.uint8 and img.ndim == 3
    f = img.astype(np.float32)
    # Rec.709 luma weights — standard for sRGB content.
    luma = (0.2126 * f[..., 0] + 0.7152 * f[..., 1] + 0.0722 * f[..., 2]) / 255.0

    # Soft-step masks. smoothstep for smooth rolloff.
    shadow_mask = _smoothstep(shadow_threshold, 0.0, luma)     # 1 at black, 0 above threshold
    highlight_mask = _smoothstep(highlight_threshold, 1.0, luma)  # 0 below threshold, 1 at white

    shadow_target = np.array(NAVY_RGB, dtype=np.float32)
    highlight_target = np.array(AMBER_RGB, dtype=np.float32)

    # Blend shadow target with soft mask
    for c in range(3):
        f[..., c] = f[..., c] * (1.0 - shadow_mix * shadow_mask) + \
            shadow_target[c] * (shadow_mix * shadow_mask)
        f[..., c] = f[..., c] * (1.0 - highlight_mix * highlight_mask) + \
            highlight_target[c] * (highlight_mix * highlight_mask)

    return np.clip(f, 0, 255).astype(np.uint8)


def warm_vignette(
    img: np.ndarray,
    darkening: float = 0.18,
    warm_tint: float = 0.06,
    falloff: float = 1.4,
) -> np.ndarray:
    """Radial darken + slight warm-tint the edges.

    `darkening` is the amount of darken at the corner (0..1).
    `warm_tint` is the amber blend at the corner (0..1).
    `falloff` controls how fast the vignette kicks in from centre
    (higher = softer, stays bright longer).
    """
    assert img.dtype == np.uint8 and img.ndim == 3
    h, w, _ = img.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cy, cx = (h - 1) / 2.0, (w - 1) / 2.0
    # Normalise radial distance to the image's major axis so the
    # falloff is consistent across aspect ratios.
    major = max(h, w) / 2.0
    d = np.sqrt((yy - cy) ** 2 + (xx - cx) ** 2) / major
    d = np.clip(d, 0, 1)
    # Softer falloff via power curve.
    vignette = d ** falloff

    f = img.astype(np.float32)
    # Darken
    darken_factor = 1.0 - (darkening * vignette)
    for c in range(3):
        f[..., c] *= darken_factor
    # Warm tint at edges — blend toward amber
    amber = np.array(AMBER_RGB, dtype=np.float32)
    for c in range(3):
        f[..., c] = f[..., c] * (1.0 - warm_tint * vignette) + \
            amber[c] * (warm_tint * vignette)
    return np.clip(f, 0, 255).astype(np.uint8)


def portra_grain(
    img: np.ndarray,
    intensity: float = 6.0,
    seed: int | None = None,
) -> np.ndarray:
    """Overlay Portra-400-style fine grain.

    Portra 400 at normal exposure has fine, tonally-coupled grain —
    slightly more visible in shadows/midtones than in highlights.
    We model this with gaussian noise scaled by a luma-inverse mask
    so highlights stay clean.

    `intensity` is the standard deviation of the base noise in 8-bit
    units. 6 is subtle, 12 is obvious.

    `seed` keeps grain deterministic. If None, we derive a seed from
    the image content so the same image always grades identically.
    """
    assert img.dtype == np.uint8 and img.ndim == 3
    h, w, _ = img.shape
    if seed is None:
        seed = _seed_from_image(img)
    rng = np.random.default_rng(seed)

    # Monochromatic grain — film grain is luminance-based, not per-channel.
    noise = rng.standard_normal((h, w), dtype=np.float32) * intensity

    f = img.astype(np.float32)
    luma = (0.2126 * f[..., 0] + 0.7152 * f[..., 1] + 0.0722 * f[..., 2]) / 255.0
    # More grain in shadows/midtones, less in highlights. Portra 400
    # retains clean skin highlights.
    grain_mask = 1.0 - (luma ** 1.3) * 0.55

    for c in range(3):
        f[..., c] = f[..., c] + noise * grain_mask

    return np.clip(f, 0, 255).astype(np.uint8)


# ---------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------

def apply_palacio_grade(
    img: np.ndarray,
    *,
    wb_strength: float = 0.08,
    shadow_mix: float = 0.18,
    highlight_mix: float = 0.22,
    vignette_darken: float = 0.18,
    vignette_warm: float = 0.06,
    grain_intensity: float = 6.0,
    grain_seed: int | None = None,
) -> np.ndarray:
    """Apply the full Palacio grade. Returns a new uint8 RGB array."""
    out = warm_white_balance(img, strength=wb_strength)
    out = tonal_curve(out, shadow_mix=shadow_mix, highlight_mix=highlight_mix)
    out = warm_vignette(out, darkening=vignette_darken, warm_tint=vignette_warm)
    out = portra_grain(out, intensity=grain_intensity, seed=grain_seed)
    return out


def grade_file(
    input_path: Path,
    output_path: Path,
    *,
    quality: int = 95,
    grain_seed: int | None = None,
) -> None:
    """Read, grade, and write a JPG. sRGB, q95 by default."""
    with Image.open(input_path) as src:
        # Ensure sRGB 8-bit RGB regardless of input colourspace.
        if src.mode != 'RGB':
            src = src.convert('RGB')
        arr = np.array(src)
    graded = apply_palacio_grade(arr, grain_seed=grain_seed)
    out_img = Image.fromarray(graded, mode='RGB')
    out_img.save(
        output_path,
        format='JPEG',
        quality=quality,
        optimize=True,
        progressive=True,
        icc_profile=None,  # sRGB default; no embedded profile needed
        subsampling=1,  # 4:2:2 — balance size vs colour fidelity
    )


# ---------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------

def _smoothstep(edge0: float, edge1: float, x: np.ndarray) -> np.ndarray:
    """Classic GLSL smoothstep. Returns 0 outside [edge0, edge1] — or
    rather, 1 at edge1 with smooth hermite interpolation.
    Handles both edge0 < edge1 AND edge0 > edge1 (descending)."""
    if edge0 == edge1:
        return np.where(x >= edge0, 1.0, 0.0)
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _seed_from_image(img: np.ndarray) -> int:
    """Derive a 32-bit seed from the image content. Idempotent per image."""
    h = hashlib.blake2s(img.tobytes(), digest_size=4).digest()
    return int.from_bytes(h, 'big')


# ---------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------

def _build_argparser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog='palacio-grade',
        description=(
            'Apply the Flostruction Palacio grade to a photograph. '
            'Deterministic Portra-400-inspired look: warm WB, amber '
            'highlights, cool shadows, fine grain, subtle vignette. '
            'Outputs sRGB JPEG q95.'
        ),
    )
    p.add_argument('input', type=Path, help='Input image (any PIL-readable format)')
    p.add_argument('output', type=Path, help='Output path (will be JPEG regardless of extension)')
    p.add_argument('--quality', type=int, default=95, help='JPEG quality 1-100 (default 95)')
    p.add_argument('--grain-seed', type=int, default=None,
                   help='Seed for grain noise (default: derived from image content)')
    return p


def main(argv: list[str] | None = None) -> int:
    args = _build_argparser().parse_args(argv)
    if not args.input.exists():
        print(f'ERROR: input not found: {args.input}', file=sys.stderr)
        return 2
    args.output.parent.mkdir(parents=True, exist_ok=True)
    try:
        grade_file(
            args.input,
            args.output,
            quality=args.quality,
            grain_seed=args.grain_seed,
        )
    except Exception as e:  # noqa: BLE001
        print(f'ERROR: {e}', file=sys.stderr)
        return 1
    print(f'graded: {args.input} -> {args.output}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
