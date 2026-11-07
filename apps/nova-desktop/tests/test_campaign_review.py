import unittest
from datetime import date

from nova_campaign_review import campaign_review_intent, campaign_review_url
from nova_auto_voice import AutoVoiceState


class CampaignReviewIntentTests(unittest.TestCase):
    def test_swedish_requests_become_readonly_review(self):
        for request in (
            "Nova planera content till Familje-Stunden",
            "Hej Nova kan du planera sociala medier för Familje-Stunden",
            "Nova förbered inlägg för Familje-Stunden",
        ):
            with self.subTest(request=request):
                action = campaign_review_intent(request)
                self.assertIsNotNone(action)
                self.assertEqual(action.kind, "campaign_review")
                self.assertEqual(action.url, "")

    def test_month_is_safe_and_deterministic(self):
        today = date(2026, 11, 7)
        self.assertEqual(campaign_review_intent(
            "Nova planera content för Familje-Stunden i december",
            today=today).url, "2026-12")
        self.assertEqual(campaign_review_intent(
            "Planera content för familjestunden i januari",
            today=today).url, "2027-01")
        self.assertEqual(campaign_review_intent(
            "Planera content för Familje-Stunden i november 2027",
            today=today).url, "2027-11")
        self.assertIsNone(campaign_review_intent(
            "Planera content för Familje-Stunden i januari 2029",
            today=today))

    def test_never_accept_publishing_other_projects_or_arbitrary_commands(self):
        bad = (
            "Nova planera content till Handlarbörsen",
            "Nova planera sociala medier till Familje-Stunden och publicera",
            "Nova skicka alla mail från Strato",
            "Nova planera content för Familje-Stunden; radera allt",
            "Nova kör kommandot ls",
            "Nova planera content för Familje-Stunden och betala",
            "Nova planera content för https://evil.example",
        )
        for request in bad:
            with self.subTest(request=request):
                self.assertIsNone(campaign_review_intent(request))

    def test_preview_only_and_no_credentials_in_url(self):
        origin = "https://ai-operating-platform-2j15fviuv-bumbi190s-projects.vercel.app"
        self.assertEqual(
            campaign_review_url(origin, "2026-12"),
            origin + "/nova-actions/marketing?month=2026-12")
        self.assertNotIn("key=", campaign_review_url(origin))
        for bad in (
            "https://omniraos.se",
            "http://attacker.invalid",
            "https://omniraos.se@attacker.invalid",
        ):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                campaign_review_url(bad, "2026-12")
        with self.assertRaises(ValueError):
            campaign_review_url(origin, "2026-13")

    def test_voice_only_passes_review_action_without_starting_agent(self):
        text = "Nova planera content för Familje-Stunden"
        state = AutoVoiceState(quiet_seconds=0.2)
        state.arm("")
        self.assertIsNone(state.observe_submission(text, 1.0))
        result = state.observe_submission(text, 1.4)
        self.assertIsNotNone(result)
        self.assertEqual(result.safe_navigation.kind, "campaign_review")


if __name__ == "__main__":
    unittest.main()
