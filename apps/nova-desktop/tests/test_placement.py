"""Placement must respect active application, not ultrawide screen edge."""
import unittest

from nova_placement import choose_working_zone
from nova_overlay import anchored_geometry


class PlacementTests(unittest.TestCase):
    def test_active_app_on_left_of_ultrawide(self):
        monitor = (0, 0, 5120, 1392)
        browser = (62, 45, 1914, 1267)
        zone = choose_working_zone(monitor, (4122, 1023), browser)
        self.assertGreaterEqual(zone[0], browser[0])
        self.assertLessEqual(zone[2], browser[2])
        self.assertLess(zone[2], 1500, zone)
        self.assertLessEqual(zone[3], browser[3])
        popup = anchored_geometry(442, 600, area=zone)
        width, height, x, y = self.parse_geometry(popup)
        self.assertGreaterEqual(x, browser[0])
        self.assertLessEqual(x + width, browser[2])
        self.assertLessEqual(y + height, browser[3])

    def test_follow_pointer_inside_active_app(self):
        monitor = (0, 0, 5120, 1392)
        window = (40, 50, 1920, 1330)
        zone = choose_working_zone(monitor, (800, 710), window)
        _, _, x, y = self.parse_geometry(anchored_geometry(442, 600, area=zone))
        self.assertLess(abs(x + 442 - 800), 200, (x, zone))
        self.assertGreaterEqual(x, window[0])
        self.assertGreaterEqual(y, window[1])
        self.assertLessEqual(x + 442, window[2])

    def test_full_monitor_fallback(self):
        zone = choose_working_zone((0, 0, 1366, 720), (800, 400), None)
        x1, y1, x2, y2 = zone
        self.assertTrue(0 <= x1 < x2 <= 1366)
        self.assertTrue(0 <= y1 < y2 <= 720)
        self.assertGreaterEqual(x2 - x1, 442)
        self.assertGreaterEqual(y2 - y1, 600)

    def test_small_foreground_ignored(self):
        monitor = (0, 0, 1920, 1080)
        zone = choose_working_zone(monitor, (1000, 500), (0, 0, 94, 94))
        self.assertGreaterEqual(zone[0], 0)
        self.assertGreater(zone[2], 500)

    def test_pinned_location_persists_and_can_be_reset(self):
        import tempfile
        from pathlib import Path
        from nova_placement import read_saved_anchor, save_anchor, clear_anchor
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "Nova" / "position.json"
            self.assertIsNone(read_saved_anchor(str(path)))
            save_anchor(str(path), (1234, 650))
            self.assertEqual(read_saved_anchor(str(path)), (1234, 650))
            path.write_text('{"version": 1, "right": 9999999, "bottom": 1}')
            self.assertIsNone(read_saved_anchor(str(path)))
            save_anchor(str(path), (480, 800))
            clear_anchor(str(path))
            self.assertIsNone(read_saved_anchor(str(path)))

    def test_expanded_window_is_placed_after_deiconify(self):
        # A real Windows ultrawide regression produced a 442x600 UI at
        # (5026,1298), retaining the previous 94x94 bubble's origin and
        # clipping almost the entire panel outside a 5120x1440 desktop.
        from pathlib import Path
        source = (Path(__file__).resolve().parents[1] / 'nova_overlay.py').read_text(encoding='utf-8')
        expanded = source[source.index('    def expand(self, listen=False):'):
                          source.index('    def collapse(self):')]
        self.assertIn('self.root.update_idletasks()', expanded)
        self.assertIn('self._place(PANEL_W, PANEL_H)', expanded)
        self.assertLess(expanded.index('self.root.deiconify()'),
                        expanded.index('self._place(PANEL_W, PANEL_H)'))

    def parse_geometry(self, g):
        import re
        match = re.fullmatch(r"(\d+)x(\d+)([+-]\d+)([+-]\d+)", g)
        self.assertIsNotNone(match, g)
        return tuple(map(int, match.groups()))


if __name__ == "__main__":
    unittest.main()
