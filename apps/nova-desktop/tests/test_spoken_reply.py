import tempfile
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

from nova_spoken_reply import SpokenReply, load_reply_mode, save_reply_mode
from nova_voice_intent import conversation_reply, local_greeting


class SpokenReplyTests(unittest.TestCase):
    def test_prefers_complete_small_speech_model_and_keeps_tiny_fallback(self):
        from nova_local_audio import _preferred_model
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            small = root / "faster-whisper-small"
            small.mkdir()
            (small / "model.bin").touch()
            self.assertEqual(_preferred_model(root), root / "faster-whisper-tiny")
            for name in ("config.json", "tokenizer.json"):
                (small / name).touch()
            self.assertEqual(_preferred_model(root), small)

    def test_choose_voice_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            choice = Path(tmp) / "voice.txt"
            self.assertEqual(load_reply_mode(choice), "choose")
            save_reply_mode(choice, "windows")
            self.assertEqual(load_reply_mode(choice), "windows")
            save_reply_mode(choice, "text")
            self.assertEqual(load_reply_mode(choice), "text")

    def test_reply_audio_is_not_accepted_as_a_new_command(self):
        player = SpokenReply()
        player.process = Mock()
        player.started = 4.0
        self.assertFalse(player.overlaps(1.0, 3.5))
        self.assertTrue(player.overlaps(4.0, 5.5))
        with patch("nova_spoken_reply.time.monotonic", return_value=6.0):
            player.stop()
        self.assertTrue(player.overlaps(4.5, 5.5))
        self.assertFalse(player.overlaps(6.5, 7.0))

    def test_microphone_check_and_help_get_direct_swedish_answers(self):
        for phrase in ("Hör du mig?", "Hej, Nova!", "Nova, är du där?", "Kan du höra mig?"):
            self.assertIn("jag hör dig", local_greeting(phrase))
        self.assertIn("Spotify", local_greeting("Nova, vad kan du hjälpa mig med?"))
        self.assertIsNone(local_greeting("Hej Nova, öppna Spotify"))

    def test_addressed_speech_to_text_word_boundary_for_app_launch(self):
        from nova_auto_voice import native_command_text, safe_auto_navigation
        heard, _ = native_command_text("Hej Nova, startas Spotify.")
        self.assertEqual(safe_auto_navigation(heard), safe_auto_navigation("starta Spotify"))
        for phrase in ("Hej Nova, startas Spotify?", "Hur startas Spotify?", "Hej Nova, startas Spotify automatiskt?"):
            heard, _ = native_command_text(phrase)
            self.assertIsNone(safe_auto_navigation(heard))

    def test_local_question_can_only_return_speech(self):
        with patch("nova_voice_intent._local_chat", return_value="Fyra.") as model:
            answer = conversation_reply("Nova, vad är två plus två?")
            self.assertEqual(answer.message, "Fyra.")
            self.assertIsNone(answer.action)
            self.assertNotIn("tools", model.call_args.args[0])
        self.assertIsNone(conversation_reply("Öppna Spotify").action)
