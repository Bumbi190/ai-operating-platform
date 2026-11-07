import unittest
from collections import namedtuple
from unittest.mock import Mock

from nova_core import URLS
from nova_native_tasks import (
    TaskStep, execute_native_step, parse_native_task, safe_native_voice_action,
)


class NativeTasksTests(unittest.TestCase):
    def test_local_git_status_is_a_real_readonly_task(self):
        plan = parse_native_task("Hej Nova, kolla projektstatus på Omnira")
        self.assertIsNotNone(plan)
        self.assertFalse(plan.requires_approval)
        self.assertEqual(plan.steps[0].kind, "git_status")
        mocked = Mock(side_effect=[
            "feat/demo", "abc1234", " M app.py\n M README.md\n",
        ])
        result = execute_native_step(plan.steps[0], git_read=mocked)
        self.assertTrue(result.success)
        self.assertIn("feat/demo", result.text)
        self.assertIn("abc1234", result.text)
        self.assertIn("2 ändrade", result.text)
        self.assertIn("inte driftstatus", result.text)
        self.assertEqual(mocked.call_count, 3)
        self.assertEqual(
            safe_native_voice_action("Visa status för Handlarbörsen").kind,
            "native_read",
        )

    def test_disk_usage_is_readonly(self):
        plan = parse_native_task("Nova hur mycket ledigt diskutrymme har jag")
        self.assertIsNotNone(plan)
        self.assertEqual(plan.steps[0].kind, "disk_free")
        Disk = namedtuple("Disk", "total used free")
        run = execute_native_step(plan.steps[0], disk_usage=lambda _p: Disk(
            100 * (1024**3), 40*(1024**3), 60*(1024**3)))
        self.assertTrue(run.success)
        self.assertIn("60.0 GB av 100.0 GB", run.text)

    def test_exact_two_step_open_plan_requires_review(self):
        plan = parse_native_task("Hej Nova, öppna Handlarbörsen och Instagram")
        self.assertIsNotNone(plan)
        self.assertTrue(plan.requires_approval)
        self.assertEqual([(x.kind,x.key) for x in plan.steps], [
            ("url", "handlarborsen"), ("url", "instagram")
        ])
        self.assertEqual(
            safe_native_voice_action("Nova öppna Facebook och LinkedIn").kind,
            "native_preview",
        )

    def test_mixed_open_app_and_folder(self):
        plan = parse_native_task("Öppna VS Code och Omniras projektmapp")
        self.assertEqual([(x.kind,x.key) for x in plan.steps], [
            ("app", "vscode"), ("folder", "omnira")
        ])

    def test_open_step_is_allowlisted_and_no_false_claim_of_page_load(self):
        mock = Mock(return_value=True)
        plan = parse_native_task("Nova öppna Facebook och Pinterest")
        result = execute_native_step(plan.steps[0], browser_open=mock)
        self.assertTrue(result.success)
        mock.assert_called_once_with(URLS["facebook"], new=2)
        self.assertIn("inte verifierad", result.text)

    def test_never_execute_unauthorized_or_user_constructed_paths(self):
        browser = Mock()
        app = Mock()
        for step in (
            TaskStep("url", "evil.example", "whatever"),
            TaskStep("app", "powershell", "Open shell"),
            TaskStep("folder", "c:/windows/system32", "Open system"),
            TaskStep("git_status", "other-project", "Read secret"),
            TaskStep("shell", "git", "Run arbitrary"),
        ):
            with self.subTest(step=step):
                result = execute_native_step(step, browser_open=browser, app_open=app)
                self.assertFalse(result.success)
        browser.assert_not_called()
        app.assert_not_called()

    def test_rejects_all_chained_mutations_and_unknown_locations(self):
        invalid = (
            "Nova öppna Facebook och publicera ett inlägg",
            "Öppna Gmail och skicka ett mail",
            "Öppna Instagram och radera gamla bilder",
            "Öppna Facebook och kör rm -rf",
            "Öppna https://evil.example och Facebook",
            "Öppna Facebook och skriv mitt lösenord",
            "Öppna Facebook och Facebook och Facebook och Facebook",
            "Öppna facebook.com och Instagram",
            "Kolla status för c:/users/andre",
            "Nova skapa ett inlägg till Facebook",
            "Nova öppna Facebook; radera filer och Instagram",
            "Visa Omnira och betala fakturan",
            "Öppna Facebook och sök på google",
        )
        for statement in invalid:
            with self.subTest(statement=statement):
                self.assertIsNone(parse_native_task(statement))
                self.assertIsNone(safe_native_voice_action(statement))

    def test_single_open_stays_in_existing_router(self):
        self.assertIsNone(parse_native_task("Nova öppna Facebook"))
        self.assertIsNone(parse_native_task("Nova öppna VS Code"))


if __name__ == "__main__":
    unittest.main()
