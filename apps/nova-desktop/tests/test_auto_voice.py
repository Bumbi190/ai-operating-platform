"""Voice auto-SEND after 3s: only exact allowlisted navigation may execute."""
import unittest

from nova_auto_voice import AutoVoiceState, safe_auto_navigation, safe_window_focus
from nova_core import URLS


class AutoVoiceTests(unittest.TestCase):
    def test_native_spoken_command_repairs_only_the_spoken_prefix(self):
        from nova_auto_voice import native_command_text
        spoken = "Innova. Ja, det. Vill du navgera till Spotify?"
        repaired, addressed = native_command_text(spoken)
        self.assertTrue(addressed)
        self.assertEqual(safe_auto_navigation(repaired).kind, "app")
        for phrase in ("Innova, öppna inte Spotify", "Ja, det. Öppna Spotify och skicka mejlet",
                       "Jag hörde Nova säga öppna Spotify", "Innova, om jag säger öppna Spotify"):
            self.assertIsNone(safe_auto_navigation(native_command_text(phrase)[0]))
        note = "Öppna INTE kalendern. Innova, navgera till Spotify!"
        self.assertEqual(native_command_text("Nova, skapa en anteckning med texten " + note)[0],
                         "Nova, skapa en anteckning med texten " + note)

    def test_explicit_safe_open_commands(self):
        for utterance, expected in (
            ("Hej Nova, vill du öppna Facebook?", URLS["facebook"]),
            ("Nova öppna Instagram.", URLS["instagram"]),
            ("Hej Nova kan du gå till LinkedIn", URLS["linkedin"]),
            ("Öppna Gmail", URLS["gmail"]),
            ("Nova öppna Handlarbörsen!", URLS["handlarborsen"]),
        ):
            with self.subTest(utterance=utterance):
                action = safe_auto_navigation(utterance)
                self.assertIsNotNone(action)
                self.assertEqual(action.kind, "open")
                self.assertEqual(action.url, expected)

    def test_all_extra_instructions_fail_closed(self):
        for utterance in (
            "",
            "Facebook",
            "Nova öppna",
            "Hej Nova berätta om Facebook",
            "Öppna Facebook och skriv ett inlägg",
            "Öppna Facebook och publicera inlägg",
            "Öppna Facebook sedan skicka meddelande",
            "Öppna Facebook och radera allt",
            "Öppna https://evil.example.com",
            "Nova öppna en terminal och kör curl",
            "Nova öppna Facebook och mejla kunder",
            "Hej Nova vill du öppna Facebook hej vill du öppna Facebook",
            "Läs det senaste mejlet och svara",
            "Skapa en ny kampanj till Familje-Stunden",
            "Starta en ny betalning",
            "Hur går det för Omnira?",
            "Öppna Facebook med lösenordet 123",
        ):
            with self.subTest(utterance=utterance):
                self.assertIsNone(safe_auto_navigation(utterance))

    def test_exact_safe_program_focus(self):
        for utterance, program in (
            ("Nova växla till VS Code", "vscode"),
            ("Hej Nova byt till Outlook", "outlook"),
            ("Byt till FileZilla", "filezilla"),
            ("Nova byt till Epic Games", "epic"),
        ):
            with self.subTest(utterance=utterance):
                action = safe_window_focus(utterance)
                self.assertIsNotNone(action)
                self.assertEqual((action.kind, action.url), ("focus", program))
        for unsafe in ("Byt till cmd.exe", "Byt till PowerShell",
                       "Växla till Outlook och skicka mejl",
                       "Nova växla till Utforskaren och radera filen"):
            self.assertIsNone(safe_window_focus(unsafe))

    def test_requires_new_text_after_arming(self):
        state = AutoVoiceState(quiet_seconds=2.6)
        state.arm("Nova öppna Facebook")
        self.assertIsNone(state.observe("Nova öppna Facebook", 1.0))
        self.assertIsNone(state.observe("Nova öppna Facebook", 6.0))
        self.assertFalse(state.saw_new_text)

    def test_executes_once_after_stable_text(self):
        state = AutoVoiceState(quiet_seconds=2.6)
        state.arm("")
        self.assertIsNone(state.observe("Hej Nova vill du öppna", 1.0))
        self.assertIsNone(state.observe("Hej Nova vill du öppna Facebook", 1.5))
        self.assertIsNone(state.observe("Hej Nova vill du öppna Facebook", 3.8))
        action = state.observe("Hej Nova vill du öppna Facebook", 4.11)
        self.assertEqual(action.url, URLS["facebook"])
        self.assertFalse(state.armed)
        self.assertTrue(state.completed)
        self.assertIsNone(state.observe("Hej Nova vill du öppna Facebook", 20.0))

    def test_late_dictation_updates_restart_quiet_window(self):
        state = AutoVoiceState(quiet_seconds=2.6)
        state.arm("")
        self.assertIsNone(state.observe("Öppna Face", 10.0))
        self.assertIsNone(state.observe("Öppna Facebook", 11.0))
        self.assertIsNone(state.observe("Öppna Facebook", 13.5))
        self.assertIsNotNone(state.observe("Öppna Facebook", 13.7))

    def test_no_auto_send_for_sensitive_or_unknown_text(self):
        state = AutoVoiceState(quiet_seconds=1.0)
        state.arm("")
        self.assertIsNone(state.observe("Öppna Facebook och publicera inlägg", 1))
        self.assertIsNone(state.observe("Öppna Facebook och publicera inlägg", 100))
        self.assertTrue(state.armed)
        self.assertIsNone(state.observe("Öppna Facebook", 101))  # changed, reset
        self.assertIsNotNone(state.observe("Öppna Facebook", 102.2))

    def test_auto_submits_general_phrase_after_three_seconds_for_review(self):
        state = AutoVoiceState()
        self.assertEqual(state.quiet_seconds, 3.0)
        state.arm("")
        self.assertIsNone(state.observe_submission("Öppna Handlarbörsens preview", 1.0))
        self.assertIsNone(state.observe_submission("Öppna Handlarbörsens preview", 3.99))
        decision = state.observe_submission("Öppna Handlarbörsens preview", 4.01)
        self.assertIsNotNone(decision)
        self.assertIsNone(decision.safe_navigation)
        self.assertEqual(decision.text, "Öppna Handlarbörsens preview")
        self.assertFalse(state.armed)
        self.assertIsNone(state.observe_submission("Öppna Handlarbörsens preview", 300))

    def test_auto_submits_mutation_as_review_only(self):
        state = AutoVoiceState()
        state.arm("")
        self.assertIsNone(state.observe_submission("Publicera på Facebook", 1.0))
        decision = state.observe_submission("Publicera på Facebook", 5.0)
        self.assertIsNone(decision.safe_navigation)
        self.assertEqual(decision.text, "Publicera på Facebook")

    def test_auto_navigation_decision_is_one_shot(self):
        state = AutoVoiceState()
        state.arm("")
        state.observe_submission("Nova öppna Facebook", 1.0)
        decision = state.observe_submission("Nova öppna Facebook", 4.02)
        self.assertEqual(decision.safe_navigation.url, URLS["facebook"])
        self.assertIsNone(state.observe_submission("Nova öppna Facebook", 9.0))

    def test_cancel_drops_pending_work(self):
        state = AutoVoiceState(quiet_seconds=0.3)
        state.arm("")
        state.observe("Öppna Facebook", 1)
        state.cancel()
        self.assertIsNone(state.observe("Öppna Facebook", 99))
        self.assertFalse(state.armed)


if __name__ == "__main__":
    unittest.main()
