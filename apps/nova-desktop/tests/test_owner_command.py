import time
import unittest
from unittest.mock import Mock

from nova_commander import commander_request
from nova_overlay import NovaOverlay


class OwnerCommandTests(unittest.TestCase):
    def panel(self):
        ui = NovaOverlay.__new__(NovaOverlay)
        ui.expanded = True
        ui.closed = False
        ui._local_voice_only = False
        ui.reply_mode = "sanna"
        ui._native_conversation_deadline = time.monotonic() + 60
        ui._append = Mock()
        ui._phase = Mock()
        ui._start_app = Mock()
        ui._begin_commander = Mock()
        ui._received_voice_without_navigation = Mock()
        ui.voice_interpreter = Mock()
        ui.transcript_var = Mock()
        ui.last_heard = "tidigare uppdrag"
        return ui

    def test_phone_conversation_cannot_overwrite_the_transcript_or_launch_work(self):
        ui = self.panel()
        for phrase in ("Jag sa att Nova skulle öppna Spotify", "starta Spotify",
                       "Lista filerna på skrivbordet", "Datoruppdrag: läs filen", "ja"):
            ui._received_native_transcript(phrase)
        self.assertEqual(ui.last_heard, "tidigare uppdrag")
        ui._start_app.assert_not_called()
        ui._begin_commander.assert_not_called()
        ui._append.assert_not_called()
        ui.transcript_var.set.assert_not_called()
        ui.voice_interpreter.submit.assert_not_called()
        ui._received_voice_without_navigation.assert_not_called()

    def test_one_request_after_wake_then_gate_closes(self):
        ui = self.panel()
        ui._received_native_transcript("Hej Nova.")
        ui._received_native_transcript("Lista filerna i hämtade filer")
        ui._received_native_transcript("Visa filerna på skrivbordet")
        ui._begin_commander.assert_called_once_with("Lista filerna i hämtade filer")

    def test_opening_panel_does_not_resume_a_browser_microphone(self):
        ui = self.panel()
        ui.bridge = Mock()
        ui.bridge.state.online.return_value = True
        ui.bridge.state.voice_snapshot.return_value = {"authorized": True, "mode": "browser"}
        ui.dictate = Mock()
        ui.start_native_mic_pilot = Mock()
        ui._start_panel_voice()
        ui.dictate.assert_not_called()
        ui.start_native_mic_pilot.assert_not_called()
        ui.bridge.state.request_voice_control.assert_not_called()

    def test_pause_by_name_stops_the_microphone(self):
        ui = self.panel()
        ui.stop = Mock()
        ui._received_native_transcript("Hej Nova, jag pratar i telefon.")
        ui.stop.assert_called_once()

    def test_only_current_local_review_can_dispatch(self):
        ui = self.panel()
        ui._choices = Mock()
        older, current = Mock(), Mock()
        ui._commander = current
        ui._commander_review = "current-step"
        ui._approve_commander(older, "current-step")
        ui._approve_commander(current, "old-step")
        ui.expanded = False
        ui._approve_commander(current, "current-step")
        current.approve.assert_not_called()
        ui.expanded = True
        ui._approve_commander(current, "current-step")
        ui._approve_commander(current, "current-step")
        current.approve.assert_called_once_with("current-step")
        older.approve.assert_not_called()

    def test_read_question_and_negation(self):
        self.assertEqual(commander_request("Nova, vad står i filen möte.txt?"), "vad står i filen möte.txt?")
        self.assertIsNone(commander_request("Öppna inte min dokumentmapp"))
        self.assertIsNone(commander_request("Jag pratade om min dator igår"))
