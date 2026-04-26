#!/usr/bin/env python3
"""Unit tests for scripts/palacio-grade.py.

Run:
    python scripts/palacio-grade.test.py

Uses the Joao v6 fixture set for before/after sanity checks. Does not
require pytest; uses stdlib unittest so it runs in any Python 3.10+
environment with PIL + numpy installed.
"""

from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

# Load palacio-grade.py as a module (filename has a hyphen).
_SCRIPT = Path(__file__).parent / 'palacio-grade.py'
_spec = importlib.util.spec_from_file_location('palacio_grade', _SCRIPT)
assert _spec and _spec.loader
palacio_grade = importlib.util.module_from_spec(_spec)
sys.modules['palacio_grade'] = palacio_grade
_spec.loader.exec_module(palacio_grade)


# ---------------------------------------------------------------------
# Fixture discovery
# ---------------------------------------------------------------------

_DOWNLOADS = Path('/sessions/admiring-wizardly-archimedes/mnt/Downloads')
_FIXTURE_CANDIDATES = [
    _DOWNLOADS / 'joao-founder-v6-1x1-400.jpg',
    _DOWNLOADS / 'joao-founder-v6-1x1-1080.jpg',
    _DOWNLOADS / 'joao-founder-v6-4x5-1080.jpg',
]


def _available_fixtures() -> list[Path]:
    return [p for p in _FIXTURE_CANDIDATES if p.exists()]


# ---------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------

def _solid(h: int, w: int, rgb: tuple[int, int, int]) -> np.ndarray:
    arr = np.zeros((h, w, 3), dtype=np.uint8)
    arr[..., 0] = rgb[0]
    arr[..., 1] = rgb[1]
    arr[..., 2] = rgb[2]
    return arr


def _vertical_grad(h: int, w: int) -> np.ndarray:
    """Black at top, white at bottom. Each row's luma = row/(h-1)."""
    vals = np.linspace(0, 255, h, dtype=np.uint8)
    arr = np.stack([np.tile(vals[:, None], (1, w))] * 3, axis=-1)
    return arr


def _mean_rgb(img: np.ndarray, slice_y=slice(None)) -> tuple[float, float, float]:
    patch = img[slice_y]
    return tuple(patch[..., c].astype(np.float64).mean() for c in range(3))


# ---------------------------------------------------------------------
# Stage-level tests
# ---------------------------------------------------------------------

class TestWarmWhiteBalance(unittest.TestCase):
    def test_neutral_grey_becomes_warmer(self):
        grey = _solid(20, 20, (128, 128, 128))
        out = palacio_grade.warm_white_balance(grey, strength=0.1)
        r, g, b = _mean_rgb(out)
        self.assertGreater(r, 128, 'R should increase')
        self.assertLess(b, 128, 'B should decrease')
        self.assertAlmostEqual(g, 128, delta=1, msg='G should stay near neutral')

    def test_zero_strength_is_identity(self):
        src = _solid(10, 10, (100, 150, 200))
        out = palacio_grade.warm_white_balance(src, strength=0.0)
        self.assertTrue(np.array_equal(src, out))

    def test_returns_uint8(self):
        src = _solid(5, 5, (255, 255, 255))
        out = palacio_grade.warm_white_balance(src, strength=0.5)
        self.assertEqual(out.dtype, np.uint8)
        self.assertTrue((out <= 255).all() and (out >= 0).all())


class TestTonalCurve(unittest.TestCase):
    def test_shadows_pulled_toward_navy(self):
        grad = _vertical_grad(200, 40)
        out = palacio_grade.tonal_curve(grad)
        # Top rows (shadows) should have B pushed up relative to R (cool).
        top = out[:20]
        r, g, b = _mean_rgb(top)
        self.assertGreater(b, r, 'shadows should cool (B > R)')

    def test_highlights_pulled_toward_amber(self):
        grad = _vertical_grad(200, 40)
        out = palacio_grade.tonal_curve(grad)
        # Bottom rows (highlights) should have R pushed up relative to B (warm).
        bottom = out[-20:]
        r, g, b = _mean_rgb(bottom)
        self.assertGreater(r, b, 'highlights should warm (R > B)')

    def test_midtones_relatively_preserved(self):
        grad = _vertical_grad(200, 40)
        out = palacio_grade.tonal_curve(grad)
        # Middle rows should barely differ from input.
        mid_in = grad[90:110]
        mid_out = out[90:110]
        diff = np.abs(mid_in.astype(int) - mid_out.astype(int)).mean()
        self.assertLess(diff, 5, f'midtone drift {diff:.1f} should be small')


class TestWarmVignette(unittest.TestCase):
    def test_corners_darker_than_center(self):
        src = _solid(200, 200, (180, 180, 180))
        out = palacio_grade.warm_vignette(src, darkening=0.3, warm_tint=0.0)
        centre = out[95:105, 95:105].astype(np.float64).mean()
        corner = out[0:10, 0:10].astype(np.float64).mean()
        self.assertGreater(centre, corner + 20, 'corners should be noticeably darker')

    def test_warm_tint_pushes_edges_toward_amber(self):
        src = _solid(200, 200, (128, 128, 128))
        out = palacio_grade.warm_vignette(src, darkening=0.0, warm_tint=0.3)
        corner = out[0:5, 0:5]
        r, g, b = _mean_rgb(corner)
        self.assertGreater(r, g, 'corner R should exceed G (amber shift)')
        self.assertGreater(g, b, 'corner G should exceed B (amber shift)')


class TestPortraGrain(unittest.TestCase):
    def test_adds_variance(self):
        src = _solid(200, 200, (128, 128, 128))
        out = palacio_grade.portra_grain(src, intensity=8.0, seed=42)
        before_std = src.astype(np.float64).std()
        after_std = out.astype(np.float64).std()
        self.assertGreater(after_std, before_std + 2, 'grain should add variance')

    def test_is_deterministic_with_seed(self):
        src = _vertical_grad(100, 100)
        a = palacio_grade.portra_grain(src, intensity=8.0, seed=123)
        b = palacio_grade.portra_grain(src, intensity=8.0, seed=123)
        self.assertTrue(np.array_equal(a, b), 'same seed should produce identical grain')

    def test_different_seeds_differ(self):
        src = _vertical_grad(100, 100)
        a = palacio_grade.portra_grain(src, intensity=8.0, seed=1)
        b = palacio_grade.portra_grain(src, intensity=8.0, seed=2)
        self.assertFalse(np.array_equal(a, b), 'different seeds should produce different grain')

    def test_content_derived_seed_is_stable(self):
        src = _vertical_grad(100, 100)
        # seed=None means derive from content
        a = palacio_grade.portra_grain(src, intensity=8.0, seed=None)
        b = palacio_grade.portra_grain(src, intensity=8.0, seed=None)
        self.assertTrue(np.array_equal(a, b),
                        'content-derived seed should be identical per image')

    def test_highlights_less_grainy_than_shadows(self):
        # A two-band image: top is near-white, bottom is dark.
        src = np.zeros((200, 100, 3), dtype=np.uint8)
        src[:100] = 240  # highlights
        src[100:] = 60   # shadows
        out = palacio_grade.portra_grain(src, intensity=10.0, seed=7)
        # Diff from original per band, as std of the residual.
        residual = out.astype(np.float64) - src.astype(np.float64)
        highlight_std = residual[:100].std()
        shadow_std = residual[100:].std()
        self.assertLess(highlight_std, shadow_std,
                        f'highlights ({highlight_std:.2f}) should be cleaner '
                        f'than shadows ({shadow_std:.2f})')


# ---------------------------------------------------------------------
# Full-pipeline tests
# ---------------------------------------------------------------------

class TestApplyPalacioGrade(unittest.TestCase):
    def test_end_to_end_is_deterministic(self):
        src = _vertical_grad(100, 100)
        a = palacio_grade.apply_palacio_grade(src, grain_seed=None)
        b = palacio_grade.apply_palacio_grade(src, grain_seed=None)
        self.assertTrue(np.array_equal(a, b),
                        'same input should produce byte-identical output')

    def test_output_shape_and_dtype_preserved(self):
        src = _vertical_grad(120, 80)
        out = palacio_grade.apply_palacio_grade(src, grain_seed=1)
        self.assertEqual(out.shape, src.shape)
        self.assertEqual(out.dtype, np.uint8)

    def test_different_params_produce_different_results(self):
        src = _vertical_grad(100, 100)
        a = palacio_grade.apply_palacio_grade(src, shadow_mix=0.0, highlight_mix=0.0)
        b = palacio_grade.apply_palacio_grade(src, shadow_mix=0.3, highlight_mix=0.3)
        self.assertFalse(np.array_equal(a, b))


# ---------------------------------------------------------------------
# File I/O tests using Joao v6 fixtures
# ---------------------------------------------------------------------

@unittest.skipUnless(_available_fixtures(), 'Joao v6 fixtures not available')
class TestFileRoundtrip(unittest.TestCase):
    def test_grade_file_writes_valid_jpeg(self):
        src_path = _available_fixtures()[0]
        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / 'graded.jpg'
            palacio_grade.grade_file(src_path, out_path, quality=95)
            self.assertTrue(out_path.exists())
            self.assertGreater(out_path.stat().st_size, 1000)
            # Re-read and verify it decodes
            with Image.open(out_path) as img:
                self.assertEqual(img.mode, 'RGB')
                self.assertEqual(img.format, 'JPEG')

    def test_grade_file_is_deterministic(self):
        """Same input + same seed → byte-identical JPEG output.
        The deterministic property is held at the pixel array level
        (before JPEG compression). JPEG re-encoding is itself
        deterministic in PIL so the file bytes also match."""
        src_path = _available_fixtures()[0]
        with tempfile.TemporaryDirectory() as tmp:
            a_path = Path(tmp) / 'a.jpg'
            b_path = Path(tmp) / 'b.jpg'
            palacio_grade.grade_file(src_path, a_path, grain_seed=42)
            palacio_grade.grade_file(src_path, b_path, grain_seed=42)
            self.assertEqual(a_path.read_bytes(), b_path.read_bytes(),
                             'same seed → identical JPEG bytes')

    def test_grade_preserves_image_dimensions(self):
        src_path = _available_fixtures()[0]
        with Image.open(src_path) as src:
            src_size = src.size
        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / 'g.jpg'
            palacio_grade.grade_file(src_path, out_path)
            with Image.open(out_path) as out:
                self.assertEqual(out.size, src_size)

    def test_graded_image_differs_from_source(self):
        """Sanity — the grade should actually *do* something."""
        src_path = _available_fixtures()[0]
        with Image.open(src_path) as src:
            src_arr = np.array(src.convert('RGB'))
        graded = palacio_grade.apply_palacio_grade(src_arr, grain_seed=42)
        diff = np.abs(src_arr.astype(int) - graded.astype(int)).mean()
        self.assertGreater(diff, 3.0,
                           f'grade diff {diff:.2f} should be meaningful')


if __name__ == '__main__':
    unittest.main(verbosity=2)
