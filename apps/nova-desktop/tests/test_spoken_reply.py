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

    def test_sanna_preference_and_verbatim_desktop_speech(self):
        from nova_bridge import BridgeState
        with tempfile.TemporaryDirectory() as tmp:
            prefs = Path(tmp) / "mode"
            save_reply_mode(prefs, "sanna")
            self.assertEqual(load_reply_mode(prefs), "sanna")
        state = BridgeState()
        state.connect()
        state.authorize_voice(mode="native")
        self.assertIsNone(state.enqueue("Spotify är öppet.", mode="nova_speech")[0])
        state.authorize_voice(mode="native", desktop_replies=True)
        self.assertIsNotNone(state.enqueue("Spotify är öppet.", mode="nova_speech")[0])
        self.assertEqual(state.next()["text"], "Spotify är öppet.")

    def test_spoken_calendar_wishes_require_a_single_named_destination(self):
        from nova_auto_voice import safe_auto_navigation
        calendar = safe_auto_navigation("öppna kalendern")
        for phrase in ("Ta mig till min kalender", "Jag skulle vilja kolla min kalender i Omnira",
                       "Okej, Nova, vill du öppna kalendern, Omnira?"):
            self.assertEqual(safe_auto_navigation(phrase), calendar)
        self.assertIsNone(safe_auto_navigation("Jag vill inte öppna min kalender"))
        self.assertIsNone(safe_auto_navigation("Jag vill kolla min kalender och boka ett möte"))

    def test_preparing_voice_is_silent_and_reused_or_cancelled(self):
        player = SpokenReply()
        idle = Mock()
        idle.poll.return_value = None
        with patch.object(player, "_launch", return_value=idle) as launch:
            player.prepare()
            self.assertIsNone(player.process)
            idle.stdin.write.assert_not_called()
            player.speak("Hej")
            self.assertIs(player.process, idle)
            launch.assert_called_once()
            idle.stdin.write.assert_called_once_with(b"Hej")
            player.stop()
        with patch.object(player, "_launch", return_value=Mock()) as launch:
            player.prepare()
            player.stop()
            launch.return_value.stdin.close.assert_called_once()
            launch.return_value.stdin.write.assert_not_called()

    def test_spoken_navigation_understands_polite_requests_without_the_model(self):
        from nova_auto_voice import native_command_text, safe_auto_navigation
        for text in ("Hej Nova! Skulle du kunna plocka fram musikappen åt mig?", "Kan du hjälpa mig att öppna Spotify?"):
            heard, _ = native_command_text(text)
            self.assertEqual(safe_auto_navigation(heard), safe_auto_navigation("starta Spotify"))
        for text in ("Hur får man upp Spotify?", "Ta fram Spotify och ändra min spellista", "Öppna inte Spotify"):
            self.assertIsNone(safe_auto_navigation(text))

    def test_gpu_decode_failure_retries_the_same_audio_then_keeps_cpu(self):
        import nova_local_voice_worker as worker
        gpu, cpu = Mock(), Mock()
        gpu.model.device = "cuda"
        with patch.object(worker, "_load_model", return_value=gpu), patch.object(worker, "_load_cpu_model", return_value=cpu) as fallback, patch.object(worker, "offline_transcribe", side_effect=[RuntimeError("CUDA unavailable"), "Hej", "En till"]) as decode:
            transcriber = worker.LocalTranscriber("model")
            self.assertEqual(transcriber.transcribe(b"first"), "Hej")
            self.assertEqual(transcriber.transcribe(b"next"), "En till")
            self.assertEqual([call.args for call in decode.call_args_list], [(b"first",gpu),(b"first",cpu),(b"next",cpu)])
            fallback.assert_called_once()

    def test_question_followup_receives_the_last_spoken_answer(self):
        with patch("nova_voice_intent._local_chat", return_value="Fem.") as model:
            reply = conversation_reply("Och om jag lägger till ett?", (("Vad är två plus två?", "Fyra."),))
        self.assertIsNone(reply.action)
        self.assertEqual(reply.message, "Fem.")
        messages = model.call_args.args[0]["messages"]
        self.assertEqual(messages[-2], {"role": "assistant", "content": "Fyra."})

    def test_first_voice_choice_can_be_spoken_and_does_not_launch_other_tools(self):
        from nova_overlay import NovaOverlay
        panel = NovaOverlay.__new__(NovaOverlay)
        panel._conversation_active = Mock(return_value=True)
        panel._discard_voice_interpretation = Mock()
        panel._local_voice_only = True
        panel.reply_mode = "choose"
        panel._append = Mock()
        panel._set_reply_mode = Mock()
        panel._connect_sanna = Mock()
        panel._received_native_transcript("Hej Nova, välj Bengt.")
        panel._set_reply_mode.assert_called_once_with("windows")
        panel._connect_sanna.assert_not_called()
        panel._received_native_transcript("Sanna.")
        panel._connect_sanna.assert_called_once()

    def test_spotify_request_from_the_real_microphone_transcript(self):
        from nova_auto_voice import safe_auto_navigation
        spotify = safe_auto_navigation("öppna Spotify")
        self.assertIsNotNone(spotify)
        for phrase in ("Vad vill du starta Spotify?", "Va, kan du öppna Spotify?", "Nova, vad skulle du kunna plocka fram musikappen åt mig?"):
            self.assertEqual(safe_auto_navigation(phrase), spotify)
        for phrase in ("Vad vill du starta Spotify för?", "Vad vill du göra med Spotify?",
                       "Vad vill du starta i Spotify?", "Vad vill du starta Spotify eller Gmail?",
                       "Vill du inte starta Spotify?"):
            self.assertIsNone(safe_auto_navigation(phrase))

    def test_desktop_access_question_reports_registered_capabilities(self):
        for phrase in ("Jag ska ha tillgång till min data.", "Har du tillgång till min dator?",
                       "Kan du öppna appar på min dator?"):
            self.assertIn("Spotify", local_greeting(phrase))
        self.assertIsNone(local_greeting("Radera min data."))

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
