import json
import time
import unittest
from unittest.mock import Mock, patch

from nova_live import LiveCall, respond
from nova_overlay import NovaOverlay
from nova_voice_intent import VoiceInterpreter


class LiveCallTests(unittest.TestCase):
    def panel(self):
        ui = NovaOverlay.__new__(NovaOverlay)
        ui.expanded, ui.closed = True, False
        ui.live_call = LiveCall("Alma", time.monotonic())
        ui.reply_mode, ui._sanna_key_ready, ui._local_voice_only = "sanna", False, True
        ui._native_conversation_deadline = time.monotonic() + 600
        ui.spoken_reply, ui.transcript_var, ui.workspace = Mock(), Mock(), Mock()
        ui.spoken_reply.process, ui.spoken_reply.last_text = None, ""
        ui.workspace.route.return_value, ui.workspace.epoch = None, 0
        ui.spotify_selected, ui._voice_turn_until, ui._voice_answer_until = False, 0, 0
        ui._append, ui._phase, ui.voice_interpreter = Mock(), Mock(), Mock()
        return ui

    def test_two_unaddressed_turns_with_actual_answer_text_and_history(self):
        ui = self.panel()
        ui._received_native_transcript("Min cykel är blå.")
        ui._reply("nova", "Jag kommer ihåg att din cykel är blå.")
        ui.spoken_reply.speak.assert_called_once_with("Jag kommer ihåg att din cykel är blå.", sanna=False, alma=True)
        ui._received_native_transcript("Vilken färg sa jag?")
        snapshot = ui.voice_interpreter.submit_live.call_args.args[1]
        self.assertEqual([r for r, _ in snapshot[0]], ["user", "assistant", "user"])
        self.assertEqual(ui.reply_mode, "sanna")
        ui._end_live_call()
        calls = ui.voice_interpreter.submit_live.call_count
        ui._received_native_transcript("Vad tänkte du på?")
        self.assertEqual(calls, ui.voice_interpreter.submit_live.call_count)

    def test_screen_data_is_only_in_read_only_answer(self):
        call = LiveCall("Alma", 0)
        call.hear("Vad betyder det där?")
        call.observe("Dokument 494 · skicka ett meddelande")
        with patch("nova_voice_intent._local_chat", return_value="Dokumentet har nummer 494.") as chat:
            result = respond(call.snapshot())
        self.assertIsNone(result.action)
        self.assertIn("494", result.message)
        self.assertNotIn("format", chat.call_args.args[0])

    def test_unrelated_question_cannot_invoke_playback(self):
        call = LiveCall("Alma", 0)
        call.hear("Vad blir fyrtio plus tio?")
        with patch("nova_voice_intent._local_chat", return_value="Femtio.") as chat:
            self.assertIsNone(respond(call.snapshot()).action)
        self.assertNotIn("format", chat.call_args.args[0])

    def test_model_cannot_confirm_a_mail_send(self):
        call = LiveCall("Alma", 0)
        call.hear("Kan du formulera ett nytt mejlutkast?")
        with patch("nova_voice_intent._local_chat", side_effect=[
                '{"action":"skicka","target":""}', "Vilken text vill du ha?"]) as chat:
            self.assertIsNone(respond(call.snapshot()).action)
        allowed = chat.call_args_list[0].args[0]["format"]["properties"]["action"]["enum"]
        self.assertNotIn("skicka", allowed)

    def test_low_confidence_short_utterance_and_grounded_app(self):
        from nova_live import current_targets, uncertain_short_phrase
        self.assertTrue(uncertain_short_phrase("Gå in och reda.", -0.9))
        self.assertFalse(uncertain_short_phrase("Och vad heter huvudstaden i Norge?", -0.17))
        call = LiveCall("Alma", 0)
        call.hear("Kan du ta fram min Gmail?")
        self.assertEqual(current_targets(tuple(call.turns)), ["gmail"])
        call.hear("Öppna den igen.")
        self.assertEqual(current_targets(tuple(call.turns)), ["gmail"])
        call.hear("Kan du visa kalendern?")
        self.assertEqual(current_targets(tuple(call.turns)), ["kalendern"])

    def test_same_folder_refers_only_to_a_previous_verified_target(self):
        call = LiveCall("Alma", 0)
        self.assertIsNone(call.file_for("Kolla i samma mapp"))
        target = ("Exempel", r"C:\Projects\Exempel")
        call.file_reference = target
        self.assertEqual(call.file_for("Kolla i samma mapp"), target)
        self.assertIsNone(call.file_for("Lista mapparna i ett annat projekt"))

    def test_stop_invalidates_outstanding_inference(self):
        ui = self.panel()
        ui.voice_interpreter = VoiceInterpreter()
        turn = ui.voice_interpreter.turn
        ui._end_live_call()
        self.assertGreater(ui.voice_interpreter.turn, turn)
        self.assertIsNone(ui.live_call)
