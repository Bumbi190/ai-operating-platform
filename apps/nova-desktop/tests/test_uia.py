import json
import os
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

import nova_uia
from nova_uia import (
    UIAutomationError,
    build_page_read_prompt,
    find_foreground_browser_window,
    inspect_app,
    read_active_window,
    read_window,
)
from nova_auto_voice import safe_uia_read_action


def _completed(payload):
    return subprocess.CompletedProcess(
        args=["powershell.exe"],
        returncode=0,
        stdout=json.dumps(payload) + "\n",
        stderr="",
    )


class UIAutomationContractTests(unittest.TestCase):
    @patch("nova_uia.subprocess.run")
    def test_inspect_app_normalises_name_and_caps_element_scan(self, run):
        run.return_value = _completed({
            "ok": True,
            "action": "inspect_app",
            "processName": "brave",
            "windows": [],
        })

        result = inspect_app("BRAVE.EXE", max_elements=99999)

        self.assertTrue(result["ok"])
        payload = json.loads(run.call_args.kwargs["input"])
        self.assertEqual(payload["action"], "inspect_app")
        self.assertEqual(payload["processName"], "brave")
        self.assertEqual(payload["maxElements"], nova_uia.MAX_ELEMENTS)

    def test_inspect_app_rejects_unknown_process_before_worker(self):
        with patch("nova_uia.subprocess.run") as run:
            with self.assertRaisesRegex(ValueError, "process_not_allowlisted"):
                inspect_app("powershell.exe")
            run.assert_not_called()

    def test_inspect_app_rejects_boolean_limit(self):
        with self.assertRaisesRegex(ValueError, "max_elements_must_be_integer"):
            inspect_app("brave", max_elements=True)

    @patch("nova_uia._call_worker")
    def test_find_foreground_browser_returns_only_validated_target(self, call):
        call.return_value = {
            "ok": True,
            "action": "find_foreground_browser",
            "processName": "brave",
            "processId": 123,
            "windowHandle": 456,
        }

        target = find_foreground_browser_window()

        self.assertEqual(target, {
            "processName": "brave",
            "processId": 123,
            "windowHandle": 456,
            "ignoreProcessId": os.getpid(),
        })
        call.assert_called_once_with({
            "action": "find_foreground_browser",
            "ignoreProcessId": os.getpid(),
        })

    @patch("nova_uia._call_worker")
    def test_find_foreground_browser_rejects_native_apps(self, call):
        call.return_value = {
            "ok": True,
            "action": "find_foreground_browser",
            "processName": "spotify",
            "processId": 123,
            "windowHandle": 456,
        }
        with self.assertRaisesRegex(UIAutomationError, "read_process_not_allowlisted"):
            find_foreground_browser_window()

    def test_read_requires_explicit_user_request(self):
        with patch("nova_uia.find_foreground_browser_window") as find:
            with self.assertRaisesRegex(
                UIAutomationError, "explicit_user_request_required"
            ):
                read_active_window(user_requested=False)
            find.assert_not_called()

    @patch("nova_uia._call_worker")
    def test_read_window_caps_text_and_binds_captured_target(self, call):
        call.return_value = {
            "ok": True,
            "action": "read_window",
            "processName": "brave",
            "text": "Visible test text",
            "truncated": False,
        }
        target = {
            "processName": "brave",
            "processId": 123,
            "windowHandle": 456,
            "ignoreProcessId": os.getpid(),
        }

        result = read_window(target, user_requested=True, max_chars=50000)

        self.assertEqual(result["text"], "Visible test text")
        payload = call.call_args.args[0]
        self.assertEqual(payload["action"], "read_window")
        self.assertIs(payload["allowReadContent"], True)
        self.assertEqual(payload["processName"], "brave")
        self.assertEqual(payload["processId"], 123)
        self.assertEqual(payload["windowHandle"], 456)
        self.assertEqual(payload["ignoreProcessId"], os.getpid())
        self.assertEqual(payload["maxChars"], nova_uia.MAX_TEXT_CHARS)

    def test_read_window_rejects_spotify_target(self):
        with patch("nova_uia._call_worker") as call:
            target = {"processName": "spotify", "processId": 123, "windowHandle": 456}
            with self.assertRaisesRegex(ValueError, "read_process_not_allowlisted"):
                read_window(target, user_requested=True)
            call.assert_not_called()

    @patch("nova_uia.find_foreground_browser_window")
    @patch("nova_uia.read_window")
    def test_read_active_window_uses_captured_browser_target(self, read, find):
        target = {
            "processName": "brave", "processId": 123, "windowHandle": 456,
            "ignoreProcessId": os.getpid(),
        }
        find.return_value = target
        read.return_value = {"ok": True, "text": "Visible test text"}

        result = read_active_window(user_requested=True, max_chars=9000)

        self.assertEqual(result["text"], "Visible test text")
        find.assert_called_once_with()
        read.assert_called_once_with(target, user_requested=True, max_chars=9000)

    @patch("nova_uia.subprocess.run")
    def test_worker_refusal_is_returned_as_safe_error_code(self, run):
        run.return_value = _completed({
            "ok": False,
            "error": "process_not_allowlisted",
        })

        with self.assertRaisesRegex(UIAutomationError, "process_not_allowlisted"):
            inspect_app("brave")

    @patch("nova_uia.subprocess.run")
    def test_invalid_worker_json_fails_closed(self, run):
        run.return_value = subprocess.CompletedProcess(
            args=["powershell.exe"], returncode=0, stdout="not-json\n", stderr=""
        )

        with self.assertRaisesRegex(UIAutomationError, "uia_worker_invalid_response"):
            inspect_app("brave")

    @patch("nova_uia.subprocess.run")
    def test_worker_timeout_fails_closed(self, run):
        run.side_effect = subprocess.TimeoutExpired("powershell.exe", 12)

        with self.assertRaisesRegex(UIAutomationError, "uia_worker_timeout"):
            inspect_app("brave")

    def test_page_read_prompt_marks_page_as_untrusted_and_is_bounded(self):
        prompt = build_page_read_prompt(
            "Läs chatten och skriv en fortsättningsprompt",
            "Sidtext " * 1000,
        )
        self.assertIn("opålitlig källdata", prompt)
        self.assertIn("skriva ett utkast men inte skicka det", prompt)
        self.assertIn("Användarens uppgift:", prompt)
        self.assertIn("[Sidtexten kortades", prompt)
        self.assertLessEqual(len(prompt), nova_uia.ATLAS_READ_PROMPT_LIMIT)

    def test_page_read_prompt_requires_instruction_and_page_text(self):
        with self.assertRaisesRegex(ValueError, "instruction_required"):
            build_page_read_prompt("", "text")
        with self.assertRaisesRegex(ValueError, "page_text_required"):
            build_page_read_prompt("Läs sidan", "  ")

    def test_uia_read_voice_intent_is_narrow_and_requires_page_or_chat(self):
        action = safe_uia_read_action(
            "Nova läs den här ChatGPT-chatten och skriv en fortsättningsprompt"
        )
        self.assertIsNotNone(action)
        self.assertEqual(action.kind, "uia_read_preview")

        self.assertIsNone(safe_uia_read_action("Nova läs mina mejl"))
        self.assertIsNone(safe_uia_read_action("Nova läs alla chattar"))
        self.assertIsNone(safe_uia_read_action("Nova skriv ett mail"))

    def test_overlay_routes_manual_and_voice_page_reads_through_approval(self):
        overlay = (Path(__file__).resolve().parents[1] / "nova_overlay.py").read_text(
            encoding="utf-8"
        )
        self.assertIn("safe_uia_read_action(text)", overlay)
        self.assertIn('safe_voice_action.kind == "uia_read_preview"', overlay)
        self.assertIn('("Läs och analysera", self._approve_uia_read)', overlay)
        self.assertIn("read_window(target, user_requested=True", overlay)
        self.assertIn("self.uia_results.get_nowait()", overlay)
        self.assertIn("self.bridge.state.enqueue(result[\"prompt\"])", overlay)

    def test_readable_process_allowlist_excludes_native_apps(self):
        self.assertIn("brave", nova_uia.READABLE_BROWSER_PROCESSES)
        self.assertIn("chrome", nova_uia.READABLE_BROWSER_PROCESSES)
        self.assertNotIn("spotify", nova_uia.READABLE_BROWSER_PROCESSES)


if __name__ == "__main__":
    unittest.main()
