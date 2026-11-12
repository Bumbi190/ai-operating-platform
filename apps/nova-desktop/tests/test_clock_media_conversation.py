from datetime import datetime, timezone
import unittest
from unittest.mock import Mock, patch

from nova_auto_voice import spotify_command
from nova_clock import CLARIFY, clock_answer
from nova_live import LiveCall, respond
from nova_spoken_reply import speech_chunks
import test_live_call


class ClockMediaConversationTests(unittest.TestCase):
    def test_world_clock_with_a_city_followup_and_dst(self):
        call = LiveCall("Alma", 0)
        call.hear("vad är klockan i Amerika idag?")
        with patch("nova_voice_intent._local_chat", side_effect=AssertionError):
            self.assertEqual(respond(call.snapshot()).message, CLARIFY)
        call.reply(CLARIFY)
        call.hear("Jag menar New York.")
        for day, hour in ((1, "08:15"), (15, "09:15")):
            now = datetime(2026, 3, day, 13, 15, tzinfo=timezone.utc)
            self.assertEqual(clock_answer(call.snapshot()[0], now=now), f"Klockan är {hour} i New York.")
        call.reply("Klockan är 09:15 i New York.")
        call.hear("Och i Los Angeles då?")
        self.assertEqual(clock_answer(call.snapshot()[0], now=now), "Klockan är 06:15 i Los Angeles.")
        call.hear("Vad hände i Los Angeles?")
        self.assertIsNone(clock_answer(call.snapshot()[0]))

    def test_actual_transcript_routes_both_spotify_requests(self):
        panel = test_live_call.LiveCallTests().panel()
        panel._control_spotify = Mock()
        panel._received_native_transcript("Okej, vill du navigera mig till Spotify och starta musiken?")
        panel._reply("ok", "Nova: Nu spelar Spotify.")
        panel._received_native_transcript("Kan du pausar med sig? Kan du pausar med sig?")
        self.assertEqual([call.args[0] for call in panel._control_spotify.call_args_list], ["play", "pause"])
        panel.voice_interpreter.submit_live.assert_not_called()

    def test_ambiguous_or_negative_followup_cannot_pause(self):
        self.assertIsNone(spotify_command("Kan du pausar med sig?"))
        for phrase in ("Kan du inte pausa musiken?", "Pausa filmen.", "Kan du pausa med sig? Nej!",
                       "Hon frågade om du kan pausa", "Pausa samtalet."):
            self.assertIsNone(spotify_command(phrase, spotify_selected=True))

    def test_sanna_configuration_switches_voice_during_the_same_call(self):
        from pathlib import Path
        from tempfile import TemporaryDirectory
        panel = test_live_call.LiveCallTests().panel()
        parent = Mock()
        panel.root = parent
        panel._display_voice_options = Mock()
        panel.live_call.hear("Vad är klockan?")
        call = panel.live_call
        with TemporaryDirectory() as temp, patch("nova_overlay.simpledialog.askstring", return_value="test"), patch("nova_sanna.save_key"):
            panel.reply_file = Path(temp) / "mode"
            panel._configure_sanna()
        self.assertIs(call, panel.live_call)
        self.assertEqual(call.voice, "Sanna")
        self.assertEqual(call.question, "Vad är klockan?")

    def test_addressed_music_pause_is_distinct_from_interrupting_nova(self):
        panel = test_live_call.LiveCallTests().panel()
        panel._interrupt_reply = Mock()
        self.assertFalse(panel._interrupt_phrase("Nova, pausa musiken"))
        self.assertTrue(panel._interrupt_phrase("Nova, pausa svaret"))
        panel._interrupt_reply.assert_called_once_with("")

    def test_long_replies_keep_sentence_boundaries_and_all_words(self):
        body = ("En längre mening med flera ord. " * 45).strip()
        chunks = speech_chunks(body)
        self.assertEqual(" ".join(chunks), body)
        self.assertTrue(all(chunk.endswith(".") and len(chunk) <= 540 for chunk in chunks))
