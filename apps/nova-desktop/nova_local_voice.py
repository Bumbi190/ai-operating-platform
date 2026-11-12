"""Pure, offline PCM speech-gate for an explicitly started Nova microphone.

The gate keeps at most 12 seconds of 16-kHz 16-bit mono PCM in memory per
utterance and never writes audio, sends network requests or invokes Atlas.
A worker may use the returned speech segment for local transcription.
"""
from __future__ import annotations

from array import array
from collections import deque
from dataclasses import dataclass, field
from math import sqrt

SAMPLE_RATE = 16000
BLOCK_FRAMES = 1024
MAX_UTTERANCE_SECONDS = 12.0
PILOT_SECONDS = 25
CONVERSATION_SECONDS = 600


def rms_level(raw_pcm16: bytes) -> float:
    if not isinstance(raw_pcm16, (bytes, bytearray, memoryview)):
        raise TypeError("PCM bytes required")
    if len(raw_pcm16) == 0 or len(raw_pcm16) % 2:
        raise ValueError("PCM must contain 16-bit samples")
    samples = array("h")
    samples.frombytes(bytes(raw_pcm16))
    return sqrt(sum(int(v) * int(v) for v in samples) / len(samples)) / 32768.0


def captured_turn(segment, buffer_end, playback_end=None):
    """Keep PCM padding for Whisper, but match playback only against voiced frames."""
    buffer_start = buffer_end - len(segment) / (2 * SAMPLE_RATE)
    if playback_end is not None and buffer_start < playback_end < buffer_end:
        offset = min(len(segment), 2 * round((playback_end - buffer_start) * SAMPLE_RATE))
        tail = segment[offset:]
        bounds = voiced_bounds(tail, playback_end)
        if bounds:
            return tail, *bounds
    bounds = voiced_bounds(segment, buffer_start)
    return (segment, *bounds) if bounds else None


def voiced_bounds(pcm, start):
    size = 2 * BLOCK_FRAMES
    gate = SpeechGate()
    hot = [i for i in range(0, len(pcm) - size + 1, size)
           if rms_level(pcm[i:i + size]) >= gate.threshold]
    if len(hot) < gate.min_voiced_frames:
        return None
    # One isolated noise frame in the pre-roll did not trigger the gate.
    first = next((a for a, b in zip(hot, hot[1:]) if b - a == size), None)
    if first is None:
        return None
    return start + first / (2 * SAMPLE_RATE), start + (hot[-1] + size) / (2 * SAMPLE_RATE)


@dataclass
class SpeechGate:
    """Energy-based, conservative VAD; NOT word recognition.

    Requires two adjacent loud frames. Silence ends a phrase after a bounded
    number of frames; too-short/noisy samples are discarded. No data is
    retained after an utterance has been handed to the local transcriber.
    """

    threshold: float = 0.006
    start_frames: int = 2
    end_silent_frames: int = 11
    min_voiced_frames: int = 4
    max_frames: int = int(MAX_UTTERANCE_SECONDS * SAMPLE_RATE / BLOCK_FRAMES)
    _pre_roll: deque[bytes] = field(default_factory=lambda: deque(maxlen=7))
    _buffer: list[bytes] = field(default_factory=list)
    _active: bool = False
    _hot_frames: int = 0
    _silent_frames: int = 0
    _voiced_frames: int = 0
    _segment_frames: int = 0

    @property
    def speaking(self) -> bool:
        return self._active

    def clear(self) -> None:
        """Discard every PCM buffer immediately; used for STOP/cancel."""
        self._pre_roll.clear()
        self._buffer.clear()
        self._active = False
        self._hot_frames = 0
        self._silent_frames = 0
        self._voiced_frames = 0
        self._segment_frames = 0

    def feed(self, raw: bytes) -> tuple[list[str], bytes | None, float]:
        if len(raw) != BLOCK_FRAMES * 2:
            raise ValueError("Unexpected PCM frame size")
        level = rms_level(raw)
        hot = level >= self.threshold
        self._pre_roll.append(bytes(raw))

        if not self._active:
            self._hot_frames = self._hot_frames + 1 if hot else 0
            if self._hot_frames < self.start_frames:
                return [], None, level
            self._active = True
            self._buffer = list(self._pre_roll)
            self._segment_frames = len(self._buffer)
            self._voiced_frames = self.start_frames
            self._silent_frames = 0
            return ["speech_start"], None, level

        self._buffer.append(bytes(raw))
        self._segment_frames += 1
        if hot:
            self._voiced_frames += 1
            self._silent_frames = 0
        else:
            self._silent_frames += 1

        if self._silent_frames < self.end_silent_frames and self._segment_frames < self.max_frames:
            return [], None, level

        segment = (
            b"".join(self._buffer)
            if self._voiced_frames >= self.min_voiced_frames
            else None
        )
        # Reset without waiting for GC of a large stale audio segment.
        self.clear()
        return ["speech_end"], segment, level
