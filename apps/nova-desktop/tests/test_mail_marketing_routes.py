"""Regression for safe Gmail/STRATO/ChatGPT/Spotify navigation."""
import unittest

from nova_core import APP_SHORTCUTS, URLS, route
from nova_auto_voice import safe_auto_navigation
from nova_native_tasks import parse_native_task


class MailMarketingRouteTests(unittest.TestCase):
    def test_strato_uses_official_webmail_without_login_data(self):
        for spoken in (
            "Nova öppna STRATO",
            "Hej Nova öppna Strato mail",
            "Nova öppna strato webmail",
        ):
            with self.subTest(spoken=spoken):
                action = route(spoken)
                self.assertEqual(action.kind, "open")
                self.assertEqual(action.url, "https://webmail.strato.com/appsuite/signin")
                self.assertEqual(safe_auto_navigation(spoken), action)
                self.assertNotIn("@", action.url)

    def test_gmail_remains_separate_from_strato(self):
        gmail = route("Nova öppna Gmail")
        strato = route("Nova öppna Strato")
        self.assertNotEqual(gmail.url, strato.url)
        self.assertEqual(gmail.url, URLS["gmail"])

    def test_chatgpt_is_allowlisted_for_navigation(self):
        spoken = "Nova öppna ChatGPT"
        action = route(spoken)
        self.assertEqual(action.kind, "open")
        self.assertEqual(action.url, URLS["chatgpt"])
        self.assertEqual(safe_auto_navigation(spoken), action)

    def test_spotify_is_allowlisted_as_local_app(self):
        spoken = "Nova öppna Spotify"
        action = route(spoken)
        self.assertEqual(action.kind, "app")
        self.assertEqual(action.url, APP_SHORTCUTS["spotify"])
        self.assertEqual(safe_auto_navigation(spoken), action)

    def test_chat_read_is_not_auto_executed_yet(self):
        request = "Nova läs den här ChatGPT-chatten"
        self.assertEqual(route(request).kind, "handoff")
        self.assertIsNone(safe_auto_navigation(request))
        self.assertIsNone(parse_native_task(request))

    def test_calendar_navigation_uses_the_real_omnira_calendar(self):
        for phrase in (
            "Nova oppna kalendern i Omnira",
            "Nova oppna kalendern",
            "Nova oppna Omniras kalender",
        ):
            with self.subTest(phrase=phrase):
                action = route(phrase)
                self.assertEqual(action.kind, "open")
                self.assertEqual(action.url, URLS["calendar"])
                self.assertEqual(safe_auto_navigation(phrase), action)
                self.assertIsNone(parse_native_task(phrase))

    def test_calendar_mutations_are_handed_to_atlas_not_opened_as_navigation(self):
        for phrase in (
            "Nova boka ett m?te med Oscar",
            "Nova skapa en kalenderh?ndelse",
            "Nova flytta m?tet till fredag",
        ):
            with self.subTest(phrase=phrase):
                self.assertEqual(route(phrase).kind, "handoff")
                self.assertIsNone(safe_auto_navigation(phrase))

    def test_planning_view_remains_available_under_its_own_name(self):
        phrase = "Nova öppna planering"
        action = route(phrase)
        self.assertEqual(action.kind, "open")
        self.assertEqual(action.url, URLS["planning"])
        self.assertEqual(safe_auto_navigation(phrase), action)

    def test_marketing_and_content_open_real_existing_routes(self):
        for request, key in (
            ("Öppna marknadsplanering", "marketing"),
            ("Nova öppna sociala medier", "marketing"),
            ("Nova öppna Omniras innehållsöversikt", "content"),
        ):
            with self.subTest(request=request):
                action = route(request)
                self.assertEqual(action.kind, "open")
                self.assertEqual(action.url, URLS[key])

    def test_multi_open_plan_needs_operator_approval(self):
        plan = parse_native_task("Nova öppna Gmail och strato webmail")
        self.assertIsNotNone(plan)
        self.assertTrue(plan.requires_approval)
        self.assertEqual(
            [(step.kind, step.key) for step in plan.steps],
            [("url", "gmail"), ("url", "strato")],
        )

    def test_chatgpt_and_spotify_multi_open_needs_approval(self):
        plan = parse_native_task("Nova öppna ChatGPT och Spotify")
        self.assertIsNotNone(plan)
        self.assertTrue(plan.requires_approval)
        self.assertEqual(
            [(step.kind, step.key) for step in plan.steps],
            [("url", "chatgpt"), ("app", "spotify")],
        )

    def test_sensitive_mail_and_publishing_actions_remain_blocked(self):
        for request in (
            "Nova läs mina mejl på STRATO",
            "Nova svara på Gmail",
            "Nova skicka ett mail från Strato",
            "Nova öppna Strato och skicka meddelande",
            "Nova publicera på Instagram",
            "Nova skapa en kalenderhändelse",
        ):
            with self.subTest(request=request):
                self.assertNotIn(route(request).kind, ("open", "app"))
                self.assertIsNone(safe_auto_navigation(request))
                self.assertIsNone(parse_native_task(request))


if __name__ == "__main__":
    unittest.main()
