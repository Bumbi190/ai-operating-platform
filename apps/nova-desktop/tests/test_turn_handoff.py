from array import array
import io
import os
import time
import unittest
from unittest.mock import Mock, patch

from nova_local_voice import BLOCK_FRAMES, SAMPLE_RATE, captured_turn
from nova_overlay import NovaOverlay
from nova_spoken_reply import SpokenReply

FRAME = BLOCK_FRAMES / SAMPLE_RATE
SILENCE = bytes(2 * BLOCK_FRAMES)
SPEECH = array("h", [2500] * BLOCK_FRAMES).tobytes()


class TurnHandoffTests(unittest.TestCase):
    def test_real_speech_start_is_after_reply_even_when_preroll_overlaps(self):
        pcm = SILENCE * 5 + SPEECH * 9 + SILENCE * 11
        _, start, end = captured_turn(pcm, 10 + FRAME * 20)
        self.assertAlmostEqual(start, 10)
        self.assertAlmostEqual(end, 10 + FRAME * 9)
        player = SpokenReply()
        player.intervals.append((7, 9.98))
        self.assertFalse(player.overlaps(start, end))

    def test_single_segment_with_speaker_echo_and_followup_decodes_only_user(self):
        pcm = SPEECH * 13 + SILENCE + SPEECH * 10 + SILENCE * 11
        tail, start, end = captured_turn(pcm, 20 + FRAME * 35, 20 + FRAME * 13)
        self.assertEqual(tail, SILENCE + SPEECH * 10 + SILENCE * 11)
        self.assertAlmostEqual(start, 20 + FRAME * 14)
        self.assertAlmostEqual(end, 20 + FRAME * 24)

    def test_echo_without_new_speech_still_overlaps(self):
        pcm = SPEECH * 10 + SILENCE * 11
        audio, start, end = captured_turn(pcm, 10 + FRAME * 21, 10 + FRAME * 10)
        self.assertEqual(audio, pcm)
        self.assertAlmostEqual(start, 10)
        self.assertAlmostEqual(end, 10 + FRAME * 10)

    def test_capture_continues_with_empty_or_partial_boundary_pipe(self):
        from nova_local_voice_worker import PlaybackBoundary
        reader, writer = os.pipe()
        try:
            boundary = PlaybackBoundary(reader)
            self.assertIsNone(boundary.poll())
            os.write(writer, b"1.")
            self.assertIsNone(boundary.poll())
            os.write(writer, b"25\n2.5\n1.75\n")
            self.assertEqual(boundary.poll(), 2.5)
            self.assertEqual(boundary.poll(), 2.5)
        finally:
            os.close(reader)
            os.close(writer)

    def test_continuous_recognizer_leaves_gpu_for_the_conversation_model(self):
        from nova_local_voice_worker import LocalTranscriber
        with patch("nova_local_voice_worker._load_cpu_model") as cpu, patch("nova_local_voice_worker._load_model") as gpu:
            LocalTranscriber("small", conversation=True)
            cpu.assert_called_once_with("small")
            gpu.assert_not_called()

    def test_audio_completion_before_subprocess_exit(self):
        player = SpokenReply()
        player.process, player.started = Mock(), 10
        send = Mock()
        with patch("nova_spoken_reply.time.monotonic", return_value=12.06):
            player._watch_output(io.BytesIO(b"12.0\n"), player.started, player.output_end, send)
        send.assert_called_once_with(12)
        self.assertTrue(player.overlaps(11, 11.5))
        self.assertFalse(player.overlaps(12.02, 12.5))

    def test_hotkey_starts_continuous_voice_and_bubble_waits_for_address(self):
        ui = NovaOverlay.__new__(NovaOverlay)
        ui._manual_anchor = (1, 1)
        ui.expand, ui.native_mic_hotkey = Mock(), Mock()
        ui.live_call, ui.native_mic_session = None, None
        ui.reply_mode = "windows"
        ui._start_live_call, ui._start_panel_voice = Mock(), Mock()
        ui._open_from_hotkey()
        ui._start_live_call.assert_called_once()
        ui._open_from_hotkey(wait_for_name=True)
        ui._start_panel_voice.assert_called_once()
        self.assertTrue(ui._call_on_wake)
        ui._conversation_active = Mock(return_value=True)
        ui._live_input = Mock()
        def join_call(): ui.live_call = object()
        ui._start_live_call.side_effect = join_call
        ui._received_native_transcript("Jag pratar i telefon.")
        ui._live_input.assert_not_called()
        ui._received_native_transcript("Hej Nova, vad är klockan?")
        ui._live_input.assert_called_once_with("vad är klockan?")
        ui._call_on_wake = False
        ui._received_native_transcript("Och i London?")
        self.assertEqual(ui._live_input.call_args.args, ("Och i London?",))
