"""Offline native PCM/VAD/transcription-pilot contract and safety tests."""
from array import array
import io
from unittest.mock import Mock
import subprocess
from pathlib import Path
import unittest
from unittest.mock import patch

from nova_local_voice import SpeechGate, BLOCK_FRAMES, rms_level
from nova_local_audio import NativeAudioSession, local_model_ready, MODEL_DIR


def frame(value: int) -> bytes:
    return array("h", [value] * BLOCK_FRAMES).tobytes()


class LocalVoiceTests(unittest.TestCase):
    def test_rms_silence_and_loudness(self):
        self.assertEqual(rms_level(frame(0)), 0)
        self.assertAlmostEqual(rms_level(frame(16384)), 0.5, places=4)
        with self.assertRaisesRegex(ValueError, "16-bit"):
            rms_level(b"\x00")
        with self.assertRaisesRegex(ValueError, "16-bit"):
            rms_level(b"")

    def test_speech_gate_extracts_short_bounded_segment_in_memory(self):
        gate = SpeechGate()
        signals = []
        results = []
        for raw in [frame(0)] * 4 + [frame(2500)] * 9 + [frame(0)] * 12:
            events, segment, _ = gate.feed(raw)
            signals.extend(events)
            if segment is not None:
                results.append(segment)
        self.assertEqual(signals.count("speech_start"), 1)
        self.assertEqual(signals.count("speech_end"), 1)
        self.assertEqual(len(results), 1)
        self.assertGreater(len(results[0]), 8 * BLOCK_FRAMES * 2)
        self.assertLessEqual(len(results[0]), int(12.1 * 16000 * 2))
        self.assertFalse(gate.speaking)
        self.assertEqual(gate._buffer, [])

    def test_noise_floor_and_short_sounds_do_not_generate_transcripts(self):
        gate = SpeechGate()
        for _ in range(30):
            events, result, rms = gate.feed(frame(20))
            self.assertEqual(events, [])
            self.assertIsNone(result)
            self.assertLess(rms, gate.threshold)
        all_events = []
        for raw in [frame(3000)] * 2 + [frame(0)] * 12:
            events, result, _ = gate.feed(raw)
            all_events += events
            self.assertIsNone(result)
        self.assertIn("speech_end", all_events)

    def test_long_utterance_is_capped(self):
        gate = SpeechGate(max_frames=12)
        collected = None
        for raw in [frame(3000)] * 100:
            events, result, _ = gate.feed(raw)
            if result is not None:
                collected = result
                break
        self.assertIsNotNone(collected)
        self.assertLessEqual(len(collected), 12 * BLOCK_FRAMES * 2)

    def test_explicit_stop_discards_untranscribed_audio(self):
        gate = SpeechGate()
        for _ in range(6):
            gate.feed(frame(3000))
        self.assertTrue(gate.speaking)
        self.assertTrue(gate._buffer)
        gate.clear()
        self.assertEqual(gate._buffer, [])
        self.assertFalse(gate.speaking)
        for _ in range(16):
            _, segment, _ = gate.feed(frame(0))
            self.assertIsNone(segment)

    def test_controller_rejects_bad_duration_and_uninstalled_model(self):
        session = NativeAudioSession()
        with self.assertRaisesRegex(ValueError, "duration"):
            session.start(seconds=90)
        with patch("nova_local_audio.local_model_ready", return_value=False):
            with self.assertRaisesRegex(RuntimeError, "MODEL_NOT_INSTALLED"):
                session.start(transcribe=True)
        self.assertIsNone(session.process)

    def test_spawn_contract_is_isolated_and_never_uses_shell(self):
        worker = Mock()
        worker.stdout = io.StringIO(chr(10).join([
            '{"kind":"ready","mode":"meter"}',
            '{"kind":"transcript","text":"Nova oppna kalendern"}',
            '{"kind":"unknown","evil":"ignore"}',
            '{"kind":"transcript","text":"' + ('x' * 510) + '"}',
        ]) + chr(10))
        worker.wait.return_value = 0
        worker.poll.return_value = 0
        with patch("nova_local_audio.subprocess.Popen", return_value=worker) as launch:
            session = NativeAudioSession()
            session.start(seconds=1.5, transcribe=False)
            session._reader.join(timeout=2)
            self.assertFalse(session._reader.is_alive())
            argv = launch.call_args.args[0]
            self.assertIn("--mode", argv)
            self.assertIn("meter", argv)
            self.assertIn("--seconds", argv)
            self.assertNotIn("--model-path", argv)
            kwargs = launch.call_args.kwargs
            self.assertEqual(kwargs["stdin"], subprocess.DEVNULL)
            self.assertEqual(kwargs["stderr"], subprocess.DEVNULL)
            self.assertNotIn("shell", kwargs)
            received = session.pop_events()
            self.assertEqual([item["kind"] for item in received],
                             ["ready", "transcript", "exit"])
            session.stop()

    def test_controller_filters_unrecognized_worker_events(self):
        session = NativeAudioSession()
        session._emit({"kind": "level", "percent": 0.2})
        self.assertEqual(session.pop_events(limit=1)[0]["kind"], "level")
        self.assertEqual(session.pop_events(), [])

    def test_native_ui_never_auto_starts_mic_at_login(self):
        overlay = (Path(__file__).resolve().parents[1] / "nova_overlay.py").read_text(encoding="utf-8")
        self.assertIn("self.native_mic_hotkey = tk.BooleanVar(value=True)", overlay)
        self.assertIn("Testa lokal mikrofon och svenska", overlay)
        self.assertIn('if os.environ.get("NOVA_START_EXPANDED") == "1":\n            self.root.after(180, self._open_from_hotkey)', overlay)
        self.assertIn("self.stop_native_mic_pilot(quiet=True)", overlay)
        self.assertIn('def _received_native_transcript(self, phrase: str):', overlay)
        self.assertIn('has_wake = value.startswith(("nova ", "nova,", "nova:", "hej nova ", "hej nova,", "hej nova:"))', overlay)
        self.assertIn("action = safe_auto_navigation(phrase) if has_wake else None", overlay)
        self.assertNotIn("subprocess.Popen", overlay[overlay.index("    def start_native_mic_pilot(self):"):overlay.index("    def _make_more_menu(self):")])

    def test_local_spoken_allowlisted_navigation_is_real_and_stops_capture(self):
        from nova_overlay import NovaOverlay
        from nova_core import URLS
        ui = NovaOverlay.__new__(NovaOverlay)
        ui._append = Mock()
        ui._phase = Mock()
        ui.stop_native_mic_pilot = Mock()
        ui._open_url = Mock()
        ui._start_app = Mock()
        ui.expanded = False
        NovaOverlay._received_native_transcript(ui, "Hej Nova, " + chr(0xf6) + "ppna kalendern")
        ui.stop_native_mic_pilot.assert_called_once_with(quiet=True)
        ui._open_url.assert_called_once()
        self.assertEqual(ui._open_url.call_args.args[0], URLS["calendar"])
        ui._start_app.assert_not_called()

    def test_local_non_wake_or_sensitive_speech_never_auto_executes(self):
        from nova_overlay import NovaOverlay
        for phrase in (
            chr(0xf6) + "ppna kalendern",
            "Nova publicera allt p? Facebook",
            "Nova skriv en prompt i ChatGPT",
            "Nova ta bort alla filer",
        ):
            with self.subTest(phrase=phrase):
                ui = NovaOverlay.__new__(NovaOverlay)
                ui._append = Mock()
                ui._phase = Mock()
                ui.stop_native_mic_pilot = Mock()
                ui._open_url = Mock()
                ui._start_app = Mock()
                ui.expanded = False
                NovaOverlay._received_native_transcript(ui, phrase)
                ui._open_url.assert_not_called()
                ui._start_app.assert_not_called()
                ui.stop_native_mic_pilot.assert_not_called()

    def test_authorized_native_stt_queues_a_single_safe_conversation_turn(self):
        from nova_overlay import NovaOverlay
        from unittest.mock import Mock
        ui = NovaOverlay.__new__(NovaOverlay)
        ui._append = Mock()
        ui._phase = Mock()
        ui.stop_native_mic_pilot = Mock()
        ui._open_url = Mock()
        ui._start_app = Mock()
        ui.expanded = False
        ui._local_voice_only = False
        ui.bridge = Mock()
        ui.bridge.state.voice_snapshot.return_value = {"authorized": True, "mode": "native"}
        ui.bridge.state.online.return_value = True
        ui.bridge.state.enqueue_native_voice.return_value = ("task-1", "queued")
        NovaOverlay._received_native_transcript(ui, "Nova, hur fungerar dagen?")
        ui.bridge.state.enqueue_native_voice.assert_called_once_with("Nova, hur fungerar dagen?")
        ui._open_url.assert_not_called()
        ui._start_app.assert_not_called()

    def test_high_risk_native_stt_must_request_review(self):
        from nova_overlay import NovaOverlay
        from unittest.mock import Mock
        ui = NovaOverlay.__new__(NovaOverlay)
        ui._append = Mock()
        ui._phase = Mock()
        ui._open_url = Mock()
        ui._start_app = Mock()
        ui._received_voice_without_navigation = Mock()
        ui.expanded = False
        ui._local_voice_only = False
        ui.bridge = Mock()
        ui.bridge.state.voice_snapshot.return_value = {"authorized": True, "mode": "native"}
        ui.bridge.state.online.return_value = True
        NovaOverlay._received_native_transcript(ui, "Nova, publicera inl?gget")
        ui._received_voice_without_navigation.assert_called_once()
        ui.bridge.state.enqueue_native_voice.assert_not_called()

    def test_native_conversation_rearms_only_when_authorized_and_visible(self):
        from nova_overlay import NovaOverlay
        from unittest.mock import Mock
        import time
        ui=NovaOverlay.__new__(NovaOverlay)
        ui.closed=False
        ui.expanded=True
        ui.native_mic_hotkey=Mock()
        ui.native_mic_hotkey.get.return_value=True
        ui._native_conversation_deadline=time.monotonic()+20
        ui._phase=Mock()
        ui.start_native_mic_pilot=Mock()
        ui._local_voice_only=False
        ui.bridge=Mock()
        ui.bridge.state.online.return_value=True
        ui.bridge.state.voice_snapshot.return_value={"authorized":True,"mode":"native"}
        ui.native_mic_session=None
        NovaOverlay._resume_native_voice_after_reply(ui)
        ui.start_native_mic_pilot.assert_called_once()

        ui.start_native_mic_pilot.reset_mock()
        ui._native_conversation_deadline=0
        NovaOverlay._resume_native_voice_after_reply(ui)
        ui.start_native_mic_pilot.assert_not_called()

        ui._native_conversation_deadline=time.monotonic()+20
        ui.bridge.state.voice_snapshot.return_value={"authorized":True,"mode":"browser"}
        NovaOverlay._resume_native_voice_after_reply(ui)
        ui.start_native_mic_pilot.assert_not_called()

    def test_native_stop_and_collapse_disable_auto_rearm(self):
        from pathlib import Path
        source=(Path(__file__).resolve().parents[1] / "nova_overlay.py").read_text(encoding="utf-8")
        for start,end in [
            ("    def stop(self):","    def quit(self):"),
            ("    def collapse(self):","    def _hotkey_check("),
            ("    def quit(self):","\n\n",),
        ]:
            block=source[source.index(start):]
            if end != "\n\n":block=block[:block.index(end)]
            else:block=block[:100]
            self.assertIn("self._native_conversation_deadline = 0.0",block)

    def test_safe_native_navigation_rearms_only_when_conversation_active(self):
        from nova_overlay import NovaOverlay
        from nova_core import URLS
        import time
        ui=NovaOverlay.__new__(NovaOverlay)
        ui._append=Mock()
        ui._phase=Mock()
        ui.stop_native_mic_pilot=Mock()
        ui._open_url=Mock()
        ui._start_app=Mock()
        ui.expanded=True
        ui.root=Mock()
        ui.native_mic_hotkey=Mock()
        ui.native_mic_hotkey.get.return_value=True
        ui._native_conversation_deadline=time.monotonic()+30
        NovaOverlay._received_native_transcript(ui,"Hej Nova, "+chr(0xf6)+"ppna kalendern")
        ui._open_url.assert_called_once()
        self.assertEqual(ui._open_url.call_args.args[0],URLS["calendar"])
        ui.root.after.assert_called_once()
        args=ui.root.after.call_args.args
        self.assertEqual(args[0],400)
        self.assertEqual(args[1],ui._resume_native_voice_after_reply)

        ui.root.reset_mock()
        ui._native_conversation_deadline=0
        NovaOverlay._received_native_transcript(ui,"Hej Nova, "+chr(0xf6)+"ppna kalendern")
        ui.root.after.assert_not_called()

    def test_worker_offline_safety_rules(self):
        worker = (Path(__file__).resolve().parents[1] / "nova_local_voice_worker.py").read_text(encoding="utf-8")
        self.assertIn('mode not in ("meter", "transcribe")', worker)
        self.assertIn('WhisperModel(str(model_dir)', worker)
        self.assertIn('model.transcribe(', worker)
        self.assertIn('model_dir.is_dir()', worker)
        self.assertIn('while time.monotonic() - since < seconds:', worker)
        self.assertIn('gate.clear()', worker)
        self.assertNotIn("snapshot_download(", worker)
        self.assertNotIn("api/chat", worker)
        self.assertNotIn("webbrowser", worker)

    def test_model_directory_matches_literal_contract(self):
        self.assertIn("Omnira", str(MODEL_DIR))
        self.assertEqual(isinstance(local_model_ready(), bool), True)


if __name__ == "__main__":
    unittest.main()
