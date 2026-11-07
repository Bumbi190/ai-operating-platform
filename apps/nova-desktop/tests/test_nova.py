import unittest
from nova_desktop import route, normalized, URLS, APP_SHORTCUTS


class NovaRouterTests(unittest.TestCase):
    def test_language_normalization(self):
        self.assertEqual(normalized("Öppna   MEJL"), "oppna mejl")

    def test_direct_gmail(self):
        action = route("Nova, öppna min mejl")
        self.assertEqual(action.kind, "open")
        self.assertEqual(action.url, URLS["gmail"])

    def test_direct_outlook_overrides_mail(self):
        self.assertEqual(route("Öppna min mail i Outlook").url, APP_SHORTCUTS["outlook"])

    def test_direct_projects(self):
        self.assertEqual(route("Öppna WebBuilder").url, URLS["projects"])

    def test_allowed_installed_programs(self):
        for name, shortcut in (("Öppna VS Code", "vscode"),
                               ("Öppna FileZilla", "filezilla"),
                               ("Öppna Chrome", "chrome"),
                               ("Öppna Epic", "epic")):
            with self.subTest(name=name):
                action = route(name)
                self.assertEqual(action.kind, "app")
                self.assertEqual(action.url, APP_SHORTCUTS[shortcut])

    def test_direct_atlas(self):
        self.assertEqual(route("Nova öppna Atlas").url, URLS["atlas"])

    def test_spoken_social_navigation(self):
        cases = {
            "Är Nova kan du navigera mig till Facebook": "facebook",
            "Nova, öppna Facebook": "facebook",
            "Nova kan du navigera mig till Instagram": "instagram",
            "Nova, gå till LinkedIn": "linkedin",
            "Kan du ta mig till Pinterest": "pinterest",
        }
        for spoken, destination in cases.items():
            with self.subTest(spoken=spoken):
                action = route(spoken)
                self.assertEqual(action.kind, "open")
                self.assertEqual(action.url, URLS[destination])

    def test_social_content_changes_require_atlas(self):
        for text in ("Öppna Facebook och publicera ett inlägg",
                     "Nova skicka DM till kund på Instagram",
                     "Planera social content till Facebook"):
            with self.subTest(text=text):
                self.assertEqual(route(text).kind, "handoff")

    def test_read_email_cannot_execute(self):
        for request in [
            "Läs mitt senaste mejl och svara",
            "Svara på Gmail",
            "Skicka mejlet till kunden",
            "Planera content till sociala medier",
            "Publicera på Instagram",
            "Radera mina filer",
            "Öppna en terminal och kör rm",
            "Vad behöver prioriteras nu?",
        ]:
            with self.subTest(request=request):
                self.assertEqual(route(request).kind, "handoff")

    def test_empty_prompt(self):
        self.assertEqual(route("  ").kind, "empty")

    def test_only_allowlisted_links_opened(self):
        for request in ("Öppna Gmail", "Gå till Handlarbörsen", "Öppna Atlas",
                        "Visa projekt", "Öppna Familje-Stunden", "Öppna planering"):
            with self.subTest(request=request):
                action = route(request)
                self.assertEqual(action.kind, "open")
                self.assertIn(action.url, URLS.values())


if __name__ == "__main__":
    unittest.main()
