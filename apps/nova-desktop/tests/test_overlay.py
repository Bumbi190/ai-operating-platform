import unittest

from nova_overlay import public_project_command, PROJECTS, anchored_geometry, work_area
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
        left, top, right, bottom = work_area()
        for width, height in ((94, 94), (442, 600)):
            g = anchored_geometry(width, height)
            size, position = g.split("+", 1)
            x, y = (int(n) for n in position.split("+"))
            self.assertGreaterEqual(x, left)
            self.assertGreaterEqual(y, top)
            self.assertLessEqual(x + width, right)
            self.assertLessEqual(y + height, bottom)


if __name__ == "__main__":
    unittest.main()
