"""Isolated foreground microphone worker for the Nova Desktop voice pilot.

Explicit CLI start only; uses the requested pilot or foreground conversation deadline.
Captures 16-kHz 16-bit mono PCM into memory, uses a conservative VAD and
optionally a locally cached Swedish Whisper model. No browser, Atlas tokens,
API calls, disk recordings, or implicit model downloads.
Stdout is JSON metadata/transcripts only, never raw audio samples.
"""
from __future__ import annotations

import argparse
from functools import partial
from collections import deque
from concurrent.futures import ThreadPoolExecutor, Future
import json
from pathlib import Path
import sys
import time
import os


from nova_local_voice import BLOCK_FRAMES, SAMPLE_RATE, SpeechGate, CONVERSATION_SECONDS, PILOT_SECONDS, captured_turn


class PlaybackBoundary:
    """Read the latest output timestamp without waiting or holding a Windows pipe lock."""
    def __init__(self, fd):
        self.fd = fd
        self.latest = None
        self.buffer = b""
        os.set_blocking(fd, False)

    def poll(self):
        try:
            while chunk := os.read(self.fd, 256):
                self.buffer += chunk
                while b"\n" in self.buffer:
                    line, self.buffer = self.buffer.split(b"\n", 1)
                    stamp = float(line)
                    if (self.latest is None or stamp > self.latest) and 0 < stamp <= time.monotonic() + .1:
                        self.latest = stamp
                if len(self.buffer) > 64:
                    self.buffer = b""
        except (BlockingIOError, BrokenPipeError):
            pass
        return self.latest


def emit(kind: str, **fields) -> None:
    print(json.dumps({"kind": kind, **fields}), flush=True)


def offline_transcribe(segment: bytes, model, scores=None) -> str:
    """Run the model on a short utterance in memory. No network or file writes."""
    import numpy as np
    pcm = np.frombuffer(segment, dtype="<i2").astype(np.float32) / 32768.0
    if not pcm.size or np.ptp(pcm) < 0.002:
        return ""
    items, _ = model.transcribe(
        pcm,
        language="sv",
        beam_size=5,
        initial_prompt="Svenska: Nova, Omnira, Spotify, kalendern, ledigt diskutrymme, en anteckning med texten.",
        best_of=1,
        condition_on_previous_text=False,
        vad_filter=False,
        temperature=0,
        without_timestamps=True,
    )
    # Iterating is required: faster-whisper returns a lazy generator.
    words = []
    for item in items:
        if item.avg_logprob < -1.3 or (item.no_speech_prob > 0.6 and item.avg_logprob < -1):
            return ""
        if scores is not None:
            scores.append(item.avg_logprob)
        words.append(item.text.strip())
    return " ".join(words).strip()[:500]


def _load_cpu_model(model_dir):
    from faster_whisper import WhisperModel
    return WhisperModel(str(model_dir), device="cpu", compute_type="int8", cpu_threads=4, num_workers=1)


def _load_model(model_dir):
    import os
    import ctranslate2
    from faster_whisper import WhisperModel

    try:
        if ctranslate2.get_cuda_device_count() and "int8_float16" in ctranslate2.get_supported_compute_types("cuda"):
            if sys.platform == "win32":
                # The same CUDA 12 runtime can be bundled with Ollama or the Python environment.
                candidates = (Path(sys.prefix) / "Lib/site-packages/nvidia/cublas/bin",
                              Path(os.environ.get("LOCALAPPDATA", "")) / "Programs/Ollama/lib/ollama/cuda_v12")
                for directory in candidates:
                    if (directory / "cublas64_12.dll").is_file():
                        # Set only in this isolated worker. The loader also uses PATH for delayed dependencies.
                        os.environ["PATH"] = str(directory) + os.pathsep + os.environ.get("PATH", "")
                        break
            return WhisperModel(str(model_dir), device="cuda", compute_type="int8_float16", num_workers=1)
    except (OSError, RuntimeError, ValueError):
        pass
    return _load_cpu_model(model_dir)


class LocalTranscriber:
    def __init__(self, model_dir, *, conversation=False):
        self.model_dir = model_dir
        # Continuous calls run local inference and recognition at the same time.
        self.model = _load_cpu_model(model_dir) if conversation else _load_model(model_dir)

    def transcribe(self, segment, scores=None):
        decode = offline_transcribe if scores is None else partial(offline_transcribe, scores=scores)
        try:
            return decode(segment, self.model)
        except (RuntimeError, OSError):
            if self.model.model.device != "cuda":
                raise
        # CUDA can first fail during decoding. Retry the same words on CPU for the rest of the session.
        self.model = None
        self.model = _load_cpu_model(self.model_dir)
        if scores is not None:
            scores.clear()
        return decode(segment, self.model)


def run(*, mode: str, seconds: float, device: int | None, model_dir: Path | None,
        conversation: bool = False, playback_boundaries: bool = False) -> int:
    limit = CONVERSATION_SECONDS if conversation and mode == "transcribe" else PILOT_SECONDS
    if mode not in ("meter", "transcribe") or not 0.5 <= seconds <= limit:
        raise ValueError("invalid pilot options")
    import sounddevice as sd

    if mode == "transcribe":
        if not model_dir or not model_dir.is_dir():
            emit("error", code="LOCAL_MODEL_NOT_INSTALLED")
            return 2
        for file in ("model.bin", "config.json", "tokenizer.json"):
            if not (model_dir / file).is_file():
                emit("error", code="LOCAL_MODEL_INCOMPLETE")
                return 2
    selected = sd.default.device[0] if device is None else device
    info = sd.query_devices(int(selected))
    if info["max_input_channels"] < 1:
        emit("error", code="NO_MICROPHONE_CHANNELS")
        return 2
    sd.check_input_settings(
        device=int(selected), channels=1, dtype="int16", samplerate=SAMPLE_RATE
    )

    gate = SpeechGate()
    boundary = PlaybackBoundary(sys.stdin.fileno()) if playback_boundaries else None
    pending: deque[tuple[Future[tuple[str, float]], float, float]] = deque()
    since = time.monotonic()
    levels = 0
    utterances = 0

    def deliver(item):
        future, start, end = item
        phrase, confidence = future.result(timeout=8)
        if phrase:
            emit("transcript", text=phrase, confidence=confidence, audio_start=start, audio_end=end)
        else:
            emit("no_transcript", audio_start=start, audio_end=end)

    try:
        # Single STT task at a time; no unbounded backlog of captured speech.
        # The executor's model stays in this worker process, not in Nova's UI.
        with ThreadPoolExecutor(max_workers=1) as pool:
            with sd.RawInputStream(
                device=int(selected),
                samplerate=SAMPLE_RATE,
                channels=1,
                dtype="int16",
                blocksize=BLOCK_FRAMES,
            ) as stream:
                emit("ready", mode=mode, device=info["name"], hz=SAMPLE_RATE)
                # Start capture first. The first words can arrive while Whisper loads.
                model_job = pool.submit(LocalTranscriber, model_dir, conversation=conversation) if mode == "transcribe" else None

                def transcribe(segment):
                    scores = []
                    phrase = model_job.result().transcribe(segment, scores)
                    return phrase, min(scores, default=0.0)

                while time.monotonic() - since < seconds:
                    raw, overflow = stream.read(BLOCK_FRAMES)
                    frame_end = time.monotonic()
                    if overflow:
                        emit("warning", code="CAPTURE_OVERFLOW")
                    kinds, segment, rms = gate.feed(bytes(raw))
                    levels += 1
                    if levels % 4 == 0:
                        emit("level", percent=round(rms * 100, 2),
                             speaking=gate.speaking)
                    for kind in kinds:
                        emit(kind)
                    if model_job and model_job.done():
                        model_job.result()  # Surface a startup failure even before speech.
                    while pending and pending[0][0].done():
                        deliver(pending.popleft())
                    if segment is not None:
                        utterances += 1
                        if model_job:
                            if len(pending) < 3:
                                emit("transcribing")
                                turn = captured_turn(segment, frame_end, boundary.poll() if boundary else None)
                                if turn:
                                    pcm, start, end = turn
                                    pending.append((pool.submit(transcribe, pcm), start, end))
                            else:
                                emit("warning", code="TRANSCRIBER_BUSY")
                gate.clear()
            for future in pending:
                deliver(future)
            emit("finished", reason="pilot_timeout", utterances=utterances)
    except KeyboardInterrupt:
        gate.clear()
        emit("finished", reason="operator_interrupt")
    except Exception:
        gate.clear()
        emit("error", code="MICROPHONE_UNAVAILABLE")
        return 2
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("meter", "transcribe"), required=True)
    parser.add_argument("--seconds", type=float, default=20.0)
    parser.add_argument("--device", type=int, default=None)
    parser.add_argument("--model-path", type=Path, default=None)
    parser.add_argument("--conversation", action="store_true")
    parser.add_argument("--playback-boundaries", action="store_true")
    args = parser.parse_args()
    return run(mode=args.mode, seconds=args.seconds,
               device=args.device, model_dir=args.model_path, conversation=args.conversation,
               playback_boundaries=args.playback_boundaries)


if __name__ == "__main__":
    sys.exit(main())
