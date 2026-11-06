"""Nova visual theme invariants: palette contrast and bounded drawing."""
import unittest
from nova_theme import (
    ACCENT, CYAN, TEXT, PANEL, SURFACE, BORDER, INITIAL_OPACITY,
    mix_color, paint_premium_panel,
)


def luminance(color):
    channels = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    channels = [v / 12.92 if v < 0.04045 else ((v + 0.055) / 1.055) ** 2.4
                for v in channels]
    return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2]


class StubCanvas:
    def __init__(self):
        self.polygons = 0
        self.lines = 0

    def create_polygon(self, *_args, **_kwargs):
        self.polygons += 1

    def create_line(self, *_args, **_kwargs):
        self.lines += 1


class ThemeTests(unittest.TestCase):
    def test_blend_endpoints_and_bounds(self):
        self.assertEqual(mix_color("#000000", "#ffffff", -10), "#000000")
        self.assertEqual(mix_color("#000000", "#ffffff", 10), "#ffffff")
        self.assertEqual(mix_color("#000000", "#ffffff", 0.5), "#808080")

    def test_readable_dark_palette(self):
        for background in (PANEL, SURFACE):
            light = max(luminance(TEXT), luminance(background))
            dark = min(luminance(TEXT), luminance(background))
            self.assertGreater((light + 0.05) / (dark + 0.05), 11)
        for color in (ACCENT, CYAN, BORDER):
            self.assertRegex(color, r"^#[0-9a-f]{6}$")

    def test_render_is_bounded(self):
        canvas = StubCanvas()
        paint_premium_panel(canvas, 442, 600)
        self.assertGreaterEqual(canvas.polygons, 4)
        self.assertGreater(canvas.lines, 250)
        self.assertLess(canvas.lines, 600)

    def test_default_alpha_is_more_transparent_than_old_panel(self):
        self.assertLess(INITIAL_OPACITY, 0.96)
        self.assertGreaterEqual(INITIAL_OPACITY, 0.82)


if __name__ == "__main__":
    unittest.main()
