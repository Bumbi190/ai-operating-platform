import unittest

from nova_overlay import public_project_command, PROJECTS, anchored_geometry, work_area, visible_dock_area
from nova_core import route
from nova_windows import ALLOWLIST, list_known_windows, focus_known_window


class OverlayNavigationTests(unittest.TestCase):
    def test_window_commands_are_bounded(self):
        self.assertEqual(route("Visa öppna program").kind, "windows")
        target = route("Nova växla till Chrome")
        self.assertEqual((target.kind, target.url), ("focus", "chrome"))
        self.assertEqual(route("Växla till ett okänt program").kind, "handoff")
        self.assertFalse(focus_known_window("cmd.exe")[0])

    def test_window_listing_exposes_no_titles(self):
        results = list_known_windows()
        self.assertTrue(all(x.key in ALLOWLIST and x.label == ALLOWLIST[x.key][1]
                            for x in results))
        self.assertTrue(all(isinstance(x.handle, int) for x in results))

    def test_known_project_folder(self):
        self.assertEqual(public_project_command("Nova öppna Handlarbörsens projektmapp"),
                         PROJECTS["Handlarbörsen"])
        self.assertEqual(public_project_command("Visa Familje-Stundens mapp"),
                         PROJECTS["Familje-Stunden"])
        self.assertEqual(public_project_command("Öppna Omnira mappen"),
                         PROJECTS["Omnira"])

    def test_not_arbitrary_folder_paths(self):
        self.assertIsNone(public_project_command("Öppna C:\\Windows\\System32 mapp"))
        self.assertIsNone(public_project_command("Radera mappen Handlarbörsen"))
        self.assertIsNone(public_project_command("Kör filen i Omnira mappen"))

    def test_sensitive_commands_dont_auto_run(self):
        for request in ("Läs mitt senaste mejl", "Svara på kundens mejl",
                        "Planera socialt content", "Publicera bild på Instagram",
                        "Skriv om koden i WebBuilder", "Ta bort en branch"):
            with self.subTest(request=request):
                self.assertEqual(route(request).kind, "handoff")

    def test_position_inside_work_area(self):
        desktop = work_area()
        for width, height in ((94, 94), (442, 600)):
            g = anchored_geometry(width, height)
            _, position = g.split("+", 1)
            x, y = (int(n) for n in position.split("+"))
            self.assertGreaterEqual(x, desktop[0])
            self.assertGreaterEqual(y, desktop[1])
            self.assertLessEqual(x + width, desktop[2])
            self.assertLessEqual(y + height, desktop[3])

    def test_ultrawide_cursor_zone_keeps_entire_chat_visible(self):
        desktop = (0, 0, 5120, 1392)
        for pointer in ((3932, 813), (4487, 815), (100, 100), (5090, 1370)):
            with self.subTest(pointer=pointer):
                zone = visible_dock_area(desktop, pointer)
                self.assertGreaterEqual(zone[0], desktop[0])
                self.assertGreaterEqual(zone[1], desktop[1])
                self.assertLessEqual(zone[2], desktop[2])
                self.assertLessEqual(zone[3], desktop[3])
                self.assertLessEqual(zone[2], pointer[0] + 110 if pointer[0] >= 1330 else 1440)
                geom = anchored_geometry(442, 600, area=zone)
                parts = geom.split("+")
                self.assertEqual(len(parts), 3)
                x, y = map(int, parts[1:])
                self.assertGreaterEqual(x, zone[0])
                self.assertGreaterEqual(y, zone[1])
                self.assertLessEqual(x + 442, zone[2])
                self.assertLessEqual(y + 600, zone[3])

    def test_regular_laptop_screen_keeps_full_chat(self):
        desktop = (0, 0, 1366, 720)
        zone = visible_dock_area(desktop, (850, 500))
        self.assertEqual(zone, desktop)
        geom = anchored_geometry(442, 600, area=zone)
        self.assertEqual(geom, "442x600+906+102")


if __name__ == "__main__":
    unittest.main()
