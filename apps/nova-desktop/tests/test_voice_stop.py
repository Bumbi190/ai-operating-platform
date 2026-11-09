"""Emergency stop takes precedence over navigation, Atlas and native task plans."""
import unittest
from pathlib import Path

from nova_auto_voice import AutoVoiceState, safe_stop_command, safe_auto_navigation
from nova_native_tasks import parse_native_task


class SafeStopCommandTests(unittest.TestCase):
    def test_strict_stop_phrases(self):
        for spoken in ("stopp", "Nova stopp", "Nova avbryt", "Hej Nova avbryt", "Tyst!", "Nova sluta prata"):
            with self.subTest(spoken=spoken):
                action = safe_stop_command(spoken)
                self.assertIsNotNone(action)
                self.assertEqual(action.kind, "stop")
                self.assertIsNone(safe_auto_navigation(spoken))
                self.assertIsNone(parse_native_task(spoken))

    def test_stop_does_not_match_business_or_work_commands(self):
        for spoken in (
            "Nova stoppa en kalenderhändelse",
            "Nova avbryt publiceringen i Facebook",
            "Nova sluta skicka mejlet",
            "Nova stoppa alla Windows-processer",
            "Jag behöver hjälp att stoppa kostnader",
        ):
            with self.subTest(spoken=spoken):
                self.assertIsNone(safe_stop_command(spoken))

    def test_spoken_stop_is_eligible_for_safe_auto_dispatch(self):
        state = AutoVoiceState(quiet_seconds=3)
        state.arm("")
        self.assertIsNone(state.observe_submission("Nova stopp", 10.0))
        self.assertIsNone(state.observe_submission("Nova stopp", 12.9))
        result = state.observe_submission("Nova stopp", 13.1)
        self.assertIsNotNone(result)
        self.assertEqual(result.safe_navigation.kind, "stop")
        self.assertTrue(state.completed)

    def test_overlay_dispatches_stop_before_native_plan_or_atlas_handoff(self):
        source = (Path(__file__).resolve().parents[1] / "nova_overlay.py").read_text(encoding="utf-8")
        send = source[source.index("    def send(self,"):source.index("    def _open_campaign_review(", source.index("    def send(self,"))]
        self.assertLess(send.index("if safe_stop_command(text):"), send.index("parse_native_task(text)"))
        self.assertIn("self.stop()", send)
        self.assertIn('self._btn(actions, "Stopp", self.stop', source)
        self.assertIn('self.command.bind("<Control-period>", self._stop_shortcut)', source)


    def test_global_hotkey_controls_authenticated_call_and_keeps_dictation_fallback(self):
        source = (Path(__file__).resolve().parents[1] / "nova_overlay.py").read_text(encoding="utf-8")
        events = source[source.index("    def _process_events(self):"):source.index("    def _animate(self):")]
        self.assertIn('voice = self.bridge.state.voice_snapshot()', events)
        self.assertIn('request_voice_control("voice_toggle")', events)
        self.assertIn('self.expand(listen=False)', events)
        self.assertIn('self.expand(listen=True)', events)

    def test_native_stop_requests_atlas_voice_interruption(self):
        source = (Path(__file__).resolve().parents[1] / "nova_overlay.py").read_text(encoding="utf-8")
        stop = source[source.index("    def stop(self):"):source.index("    def quit(self):")]
        self.assertIn('request_voice_control("voice_interrupt")', stop)
    def test_paired_speech_resumes_atlas_not_windows_diction(self):
        source = (Path(__file__).resolve().parents[1] / "nova_overlay.py").read_text(encoding="utf-8")
        dictate = source[source.index("    def dictate(self):"):source.index("    def _send_windows_voice_typing_shortcut(", source.index("    def dictate(self):"))]
        self.assertIn('request_voice_control("voice_resume")', dictate)
        self.assertIn('if self.bridge.state.online()', dictate)
        self.assertIn("self._auto_voice.cancel()", dictate)
        self.assertLess(dictate.index('request_voice_control("voice_resume")'),
                        dictate.index("self._focus_guard.ensure_focus"))
        self.assertIn("if self.bridge.state.online() and self.bridge.state.voice_snapshot().get", source)

    def test_operator_approval_is_separate_from_local_read_only_chat(self):
        source = (Path(__file__).resolve().parents[1] / "nova_overlay.py").read_text(encoding="utf-8")
        self.assertIn('def _approved_operator_task(', source)
        self.assertIn('self.bridge.state.enqueue_operator(text)', source)
        self.assertIn('("K?r i Atlas (med verktyg)"', source)
        self.assertIn('("Bara r?d (utan verktyg)"', source)
        self.assertIn('elif action.kind == "handoff":', source)


if __name__ == "__main__":
    unittest.main()
