"""Regression for safe Gmail/STRATO/Omnira navigation. No account access."""
import unittest
from nova_core import URLS, route
from nova_auto_voice import safe_auto_navigation
from nova_native_tasks import parse_native_task, execute_native_step


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

    def test_calendar_navigation_is_only_existing_planning_read(self):
        for phrase in ("Nova öppna kalendern i Omnira",
                       "Nova öppna kalendern",
                       "Nova öppna Omniras kalender"):
            with self.subTest(phrase=phrase):
                action = route(phrase)
                self.assertEqual(action.kind, "open")
                self.assertEqual(action.url, URLS["planning"])
                self.assertIn("inte en separat kalender", action.description)

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
        self.assertEqual([(s.kind,s.key) for s in plan.steps],
                         [("url","gmail"),("url","strato")])

    def test_sensitive_mail_actions_remain_blocked(self):
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
