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

    def test_listening_hint_distinguishes_wake_from_an_invited_turn(self):
        ui = self.panel()
        ui._voice_turn_until = ui._voice_answer_until = 0.0
        self.assertIn("Hej Nova", ui._listening_hint())
        ui._voice_turn_until = time.monotonic() + 15
        self.assertEqual(ui._listening_hint(), "Säg ditt uppdrag")
        ui._voice_turn_until = 0.0
        ui._voice_answer_until = time.monotonic() + 25
        self.assertEqual(ui._listening_hint(), "Väntar på ditt svar")

    def test_connected_event_never_prompts_again_for_an_authorized_voice(self):
        import queue
        ui = self.panel()
        ui.root = Mock()
        ui.uia_results = queue.SimpleQueue()
        ui.bridge = Mock()
        ui.bridge.state.voice_snapshot.return_value = {"authorized": True, "mode": "native"}
        ui.bridge.state.events = queue.SimpleQueue()
        ui.bridge.state.events.put({"kind": "connected"})
        ui._poll_bridge()
        ui._append.assert_not_called()
        ui._phase.assert_not_called()

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

    def test_spotify_confirmation_and_second_navigation(self):
        from nova_voice_intent import interpret
        ui = self.panel()
        ui.native_mic_session = Mock()
        ui._open_url = Mock()
        result = interpret("Nova, vi har öppnat Spotify.", False)
        self.assertTrue(result.confirm)
        ui._voice_suggestion = result.action
        ui._voice_answer_until = time.monotonic() + 25
        ui._received_native_transcript("Ja, öppna den.")
        ui._start_app.assert_called_once_with(result.action)
        ui._received_native_transcript("Och öppna kalendern.")
        ui._open_url.assert_called_once()
        ui._received_native_transcript("Jag sa att vi skulle öppna Spotify.")
        self.assertEqual(ui._start_app.call_count, 1)

    def test_three_spoken_turns_and_a_natural_screen_question(self):
        from nova_workspace import Workspace
        ui = self.panel()
        ui.workspace = Workspace(ui)
        ui.workspace.job = Mock()
        ui._choices = Mock()
        ui._control_spotify = Mock()
        ui._received_native_transcript("Hej Nova, starta Spotify.")
        ui._received_native_transcript("Pausa musiken.")
        ui._received_native_transcript("Fortsätt spela musiken.")
        self.assertEqual([call.args for call in ui._control_spotify.call_args_list], [("play",), ("pause",), ("play",)])
        ui._received_native_transcript("Jättebra, Nova. Kan du se chatgipetinsidan jag har öppnat?")
        self.assertEqual(ui.workspace.job.call_args.args[0], "page")
        ui._received_native_transcript("Kan du läsa sidan som jag har öppnat?")
        self.assertEqual(ui.workspace.job.call_count, 2)
        ui.voice_interpreter.submit.assert_not_called()
        ui._voice_navigation_until = time.monotonic() - 1
        ui._received_native_transcript("Kan du läsa sidan som jag har öppnat?")
        self.assertEqual(ui.workspace.job.call_count, 2)

    def test_short_navigation_and_explicit_media_followups(self):
        ui = self.panel()
        ui.native_mic_session = Mock()
        ui._open_url = Mock()
        ui._control_spotify = Mock()
        ui.spotify_selected = True
        ui._received_native_transcript("Hej Nova, starta Spotify.")
        ui._received_native_transcript("Och pausa musiken.")
        self.assertEqual([c.args for c in ui._control_spotify.call_args_list], [("play",), ("pause",)])
        ui._received_native_transcript("Och kalendern då?")
        ui._open_url.assert_called_once()
        self.assertIn("/calendar", ui._open_url.call_args.args[0])

    def test_followup_gate_ignores_background_mentions_and_expired_commands(self):
        ui = self.panel()
        ui.native_mic_session = Mock()
        ui._open_url = Mock()
        ui.spotify_selected = True
        ui._voice_navigation_until = time.monotonic() + 20
        for text in ("Kalendern är full", "Och kalendern var öppen då.", "Och öppna inte Gmail",
                     "Och kalendern och skicka mejlet", "Jag pratade om att pausa Spotify"):
            ui._received_native_transcript(text)
        ui._voice_navigation_until = time.monotonic() - 1
        ui._received_native_transcript("Och kalendern då?")
        ui._open_url.assert_not_called()
        ui._append.assert_not_called()

    def test_plain_stop_during_spoken_reply(self):
        ui = self.panel()
        ui.spoken_reply = Mock()
        ui.spoken_reply.process = object()
        ui.stop = Mock()
        ui._received_native_transcript("Stopp.")
        ui.stop.assert_called_once()

    def test_expired_confirmation_and_unaddressed_phone_audio(self):
        from nova_voice_intent import interpret
        ui = self.panel()
        ui._voice_suggestion = interpret("Nova, vi har öppnat Spotify.", False).action
        ui._voice_answer_until = time.monotonic() - 3
        ui._received_native_transcript("Ja, öppna den.")
        ui._start_app.assert_not_called()

    def test_sanna_settings_offer_native_setup_for_new_phrases(self):
        ui = self.panel()
        ui._sanna_key_ready = False
        ui._configure_sanna = Mock()
        ui._connect_sanna = Mock()
        self.assertEqual(ui._local_voice_caption(), ui._call_voice() + " lokalt · Anslut Sanna")
        ui._choose_voice_settings()
        ui._configure_sanna.assert_called_once()
        ui._sanna_key_ready = True
        self.assertIn("Windows-mikrofon", ui._local_voice_caption())
        ui._choose_voice_settings()
        ui._connect_sanna.assert_called_once()

    def test_stock_sanna_replies_work_without_provider_access(self):
        import nova_sanna
        import io, wave
        from unittest.mock import patch
        with patch.object(nova_sanna, 'provider_key', side_effect=AssertionError('offline')):
            for phrase in nova_sanna.REPLIES:
                with wave.open(io.BytesIO(nova_sanna.reply_wave(phrase))) as clip:
                    self.assertEqual(clip.getframerate(), 24000)
                    self.assertGreater(clip.getnframes(), 24000)
