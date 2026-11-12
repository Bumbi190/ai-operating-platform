"""Offline regressions for voice choice, Atlas routing and operator approval."""
import time
import unittest
from unittest.mock import Mock, patch

from nova_core import is_operator_request, is_calendar_read_request
from nova_overlay import NovaOverlay


class AtlasVoiceRoutingTests(unittest.TestCase):
    def panel(self, *, online=True, authorized=True, mode="native"):
        ui = NovaOverlay.__new__(NovaOverlay)
        ui.expanded = True
        ui.closed = False
        ui.reply_mode = "sanna"
        ui._local_voice_only = True
        ui._native_conversation_deadline = time.monotonic() + 60
        ui._voice_turn_until = ui._voice_answer_until = ui._voice_navigation_until = 0.0
        ui._voice_suggestion = None
        ui._destination_question = False
        ui.spotify_selected = False
        ui.pending = ""
        ui._waiting_operator_request = None
        ui._commander = None
        ui.native_mic_session = Mock()
        ui.spoken_reply = Mock()
        ui.spoken_reply.process = None
        ui.voice_interpreter = Mock()
        ui.bridge = Mock()
        ui.bridge.state.online.return_value = online
        ui.bridge.state.voice_snapshot.return_value = {
            "authorized": authorized, "mode": mode, "status": "idle",
        }
        ui.bridge.state.task = None
        ui.bridge.state.enqueue_native_voice.return_value = ("native-turn", "")
        ui.bridge.state.enqueue_operator.return_value = ("operator-turn", "")
        ui.root = Mock()
        ui.transcript_var = Mock()
        for method in ("_append", "_phase", "_reply", "_choices", "_start_app",
                       "_open_url", "_begin_commander", "stop_native_mic_pilot",
                       "start_native_mic_pilot", "_display_voice_options"):
            setattr(ui, method, Mock())
        return ui

    def test_conversational_work_requests_are_detected_for_review(self):
        for text in (
            "Nova, lägg till gymmet i kalendern imorgon klockan 17",
            "Nova, jag vill att du lägger till gymmet i kalendern imorgon",
            "Jag behöver att du flyttar mötet till fredag",
            "Nova, kan du hjälpa mig att boka gymmet i kalendern?",
            "Jag skulle vilja att du ändrar tiden till 17",
            "Kan du ta bort min testanteckning?",
        ):
            with self.subTest(text=text):
                self.assertTrue(is_operator_request(text))

    def test_questions_reports_and_negations_are_not_operator_requests(self):
        for text in (
            "Nova, vad har jag i kalendern imorgon?",
            "Hur lägger jag till ett möte i kalendern?",
            'Nova, förklara kommandot "lägg till gymmet i kalendern"',
            "Nova, jag sa att du skulle boka ett möte",
            "Nova, boka inte något",
            "Jag vill att du inte lägger till något",
        ):
            with self.subTest(text=text):
                self.assertFalse(is_operator_request(text))

    def test_sanna_general_question_uses_authorized_atlas_and_pauses_capture(self):
        ui = self.panel()
        ui._received_native_transcript("Nova, varför är himlen blå?")
        ui.bridge.state.enqueue_native_voice.assert_called_once()
        ui.bridge.state.enqueue_operator.assert_not_called()
        ui.stop_native_mic_pilot.assert_called_once_with(quiet=True)
        ui.voice_interpreter.submit.assert_not_called()
        self.assertEqual(ui.reply_mode, "sanna")

    def test_calendar_read_classifier_excludes_definitions_navigation_and_negation(self):
        for text in (
            "Nova, vad har jag i kalendern imorgon?",
            "Vad står i min kalender på fredag?",
            "Kan du läsa upp min kalender för idag?",
            "Vilka möten har jag i kalendern nästa vecka?",
        ):
            with self.subTest(text=text):
                self.assertTrue(is_calendar_read_request(text))
        for text in (
            "Vad är en kalender?",
            "Hur fungerar en kalender?",
            "Nova, öppna kalendern",
            "Visa kalendern",
            "Nova, läs inte min kalender",
            'Förklara frågan "vad har jag i kalendern imorgon?"',
            "Jag sa att Nova skulle kolla min kalender",
        ):
            with self.subTest(text=text):
                self.assertFalse(is_calendar_read_request(text))

    def test_personal_calendar_read_requires_current_review_before_atlas_tools(self):
        ui = self.panel()
        ui._received_native_transcript("Nova, vad har jag i kalendern imorgon?")
        self.assertIn("vad har jag i kalendern imorgon?", ui.pending)
        ui.voice_interpreter.submit.assert_not_called()
        ui.bridge.state.enqueue_native_voice.assert_not_called()
        ui.bridge.state.enqueue_operator.assert_not_called()
        review = ui._choices.call_args.args[0]
        self.assertEqual(review[0][0], "Kör i Atlas (med verktyg)")
        request = ui.pending
        review[0][1]()
        ui.bridge.state.enqueue_operator.assert_called_once_with(request)

    def test_unpaired_calendar_read_waits_for_connection_and_preserves_request(self):
        ui = self.panel(online=False, authorized=False)
        ui._received_native_transcript("Nova, vad har jag i kalendern imorgon?")
        self.assertEqual(ui._waiting_operator_request, ui.pending)
        self.assertIn("vad har jag i kalendern imorgon?", ui.pending)
        self.assertEqual(ui._choices.call_args.args[0][0][0], "Anslut Atlas för uppdraget")
        ui.bridge.state.enqueue.assert_not_called()
        ui.bridge.state.enqueue_native_voice.assert_not_called()
        ui.bridge.state.enqueue_operator.assert_not_called()
        ui.voice_interpreter.submit.assert_not_called()

    def test_canceling_calendar_read_invalidates_its_review_callback(self):
        ui = self.panel()
        ui._received_native_transcript("Nova, vad har jag i kalendern imorgon?")
        approval = ui._choices.call_args.args[0][0][1]
        ui._cancel_operator_request()
        approval()
        self.assertEqual(ui.pending, "")
        ui.bridge.state.enqueue_operator.assert_not_called()
        ui.bridge.state.enqueue_native_voice.assert_not_called()

    def test_calendar_write_waits_for_current_explicit_operator_approval(self):
        ui = self.panel()
        ui._received_native_transcript(
            "Nova, jag vill att du lägger till gymmet i kalendern imorgon klockan 17"
        )
        self.assertIn("lägger till gymmet", ui.pending)
        ui.bridge.state.enqueue_operator.assert_not_called()
        ui.bridge.state.enqueue_native_voice.assert_not_called()
        ui.voice_interpreter.submit.assert_not_called()
        choices = ui._choices.call_args.args[0]
        self.assertEqual(choices[0][0], "Kör i Atlas (med verktyg)")
        pending = ui.pending
        choices[0][1]()
        ui.bridge.state.enqueue_operator.assert_called_once_with(pending)
        self.assertIsNone(ui.pending)

    def test_spoken_event_without_calendar_word_preserves_reviewed_details(self):
        ui = self.panel()
        ui._received_native_transcript(
            "Hej, Nova. Vill du lägga till att den 13 december klockan 13:00 "
            "ska min släkting ha ett kalas hemma? Hon fyller fem."
        )
        self.assertIn("13 december klockan 13:00", ui.pending)
        self.assertIn("min släkting ha ett kalas hemma? Hon fyller fem.", ui.pending)
        self.assertEqual(ui._choices.call_args.args[0][0][0], "Kör i Atlas (med verktyg)")
        ui.voice_interpreter.submit.assert_not_called()
        ui.bridge.state.enqueue_native_voice.assert_not_called()
        ui.bridge.state.enqueue_operator.assert_not_called()

    def test_unpaired_work_request_waits_for_connection_without_dispatch(self):
        ui = self.panel(online=False, authorized=False)
        ui._received_native_transcript(
            "Nova, jag vill att du lägger till gymmet i kalendern imorgon"
        )
        self.assertEqual(ui._waiting_operator_request, ui.pending)
        self.assertTrue(ui.pending)
        self.assertEqual(ui._choices.call_args.args[0][0][0], "Anslut Atlas för uppdraget")
        ui.bridge.state.enqueue_operator.assert_not_called()
        ui.bridge.state.enqueue_native_voice.assert_not_called()
        ui.bridge.state.enqueue.assert_not_called()

    def test_offline_or_ungranted_session_keeps_local_question_fallback(self):
        for online, authorized in ((False, False), (True, False)):
            with self.subTest(online=online, authorized=authorized):
                ui = self.panel(online=online, authorized=authorized)
                ui._received_native_transcript("Nova, vad är en kalender?")
                ui.voice_interpreter.submit.assert_called_once()
                ui.bridge.state.enqueue_native_voice.assert_not_called()
                ui.bridge.state.enqueue_operator.assert_not_called()

    def test_quoted_or_negated_work_never_dispatches_an_implicit_tool_job(self):
        for text in (
            'Nova, förklara kommandot "lägg till gymmet i kalendern"',
            "Nova, jag vill att du inte lägger till något i kalendern",
            "Nova, boka inte något",
            "Nova, jag sa att du flyttar mötet till fredag",
        ):
            with self.subTest(text=text):
                ui = self.panel()
                ui._received_native_transcript(text)
                ui.bridge.state.enqueue_operator.assert_not_called()
                ui.bridge.state.enqueue_native_voice.assert_not_called()
                self.assertTrue(ui.pending)

    def test_cancel_and_replaced_request_invalidate_old_approval(self):
        for cancel in (True, False):
            with self.subTest(cancel=cancel):
                ui = self.panel()
                ui._received_voice_without_navigation("Lägg till gymmet imorgon")
                old_approval = ui._choices.call_args.args[0][0][1]
                if cancel:
                    ui._cancel_operator_request()
                else:
                    ui.pending = "Lägg till ett annat möte"
                old_approval()
                ui.bridge.state.enqueue_operator.assert_not_called()

    def test_stop_invalidates_pending_job_before_any_later_approval(self):
        ui = self.panel()
        ui._cancel_commander = Mock()
        ui._stop_reply = Mock()
        ui._cancel_spotify_control = Mock()
        ui._voice_request_id = ui.native_task_epoch = ui.task_epoch = 0
        ui._auto_voice = Mock()
        ui._received_voice_without_navigation("Lägg till gymmet imorgon")
        old_approval = ui._choices.call_args.args[0][0][1]
        ui._received_native_transcript("Nova, stopp")
        old_approval()
        self.assertEqual(ui.pending, "")
        self.assertEqual(ui._native_conversation_deadline, 0.0)
        ui.bridge.state.cancel.assert_called_once()
        ui.bridge.state.request_voice_control.assert_called_once_with("voice_interrupt")
        ui.bridge.state.enqueue_operator.assert_not_called()
        ui.bridge.state.enqueue_native_voice.assert_not_called()

    def test_pairing_readiness_is_independent_of_output_voice(self):
        for online, authorized, local_only in (
            (True, True, False), (False, False, True), (True, False, True)
        ):
            with self.subTest(online=online, authorized=authorized):
                ui = self.panel(online=online, authorized=authorized)
                with patch("nova_overlay.local_model_ready", return_value=True):
                    ui._start_panel_voice()
                self.assertEqual(ui._local_voice_only, local_only)
                self.assertEqual(ui.reply_mode, "sanna")
                ui.start_native_mic_pilot.assert_called_once()

    def test_browser_grant_is_not_a_native_microphone_grant(self):
        ui = self.panel(mode="browser")
        ui._start_panel_voice()
        ui.start_native_mic_pilot.assert_not_called()
        ui.bridge.state.request_voice_control.assert_not_called()
        ui.bridge.state.enqueue_native_voice.assert_not_called()


if __name__ == "__main__":
    unittest.main()
