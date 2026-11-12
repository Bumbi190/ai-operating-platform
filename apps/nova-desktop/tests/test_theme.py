"""Nova visual theme invariants: palette contrast and bounded drawing."""
import struct
import unittest
import zlib
from nova_theme import (
    ACCENT, CYAN, TEXT, PANEL, SURFACE, BORDER, INITIAL_OPACITY,
    mix_color, mark_image, rounded_surface, TRANSPARENT, MUTED,
)


def luminance(color):
    channels = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    channels = [v / 12.92 if v < 0.04045 else ((v + 0.055) / 1.055) ** 2.4
                for v in channels]
    return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2]


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

    def test_mark_renders_at_native_size_with_keyed_corners(self):
        for size in (50, 75, 100):
            data = mark_image(size, TRANSPARENT)
            self.assertEqual(struct.unpack(">2I", data[16:24]), (size, size))
            offset = data.index(b"IDAT")
            length = int.from_bytes(data[offset-4:offset], "big")
            pixels = zlib.decompress(data[offset+4:offset+4+length])
            self.assertEqual(len(pixels), (size*3+1)*size)
            self.assertEqual(pixels[1:4], bytes.fromhex(TRANSPARENT[1:]))
            self.assertNotEqual(mark_image(size, TRANSPARENT, True), data)

    def test_panel_scales_without_translucent_text(self):
        for width, height in ((416, 520), (624, 780)):
            data = rounded_surface(width, height, 16, SURFACE, BORDER, TRANSPARENT)
            self.assertEqual(struct.unpack(">2I", data[16:24]), (width, height))
        self.assertGreater((luminance(MUTED)+.05)/(luminance(PANEL)+.05), 4.5)
        self.assertEqual(INITIAL_OPACITY, 1.0)


if __name__ == "__main__":
    unittest.main()
