"""Isolated foreground microphone worker for the Nova Desktop voice pilot.

Explicit CLI start only; runs for at most 25 seconds per approved pilot session.
Captures 16-kHz 16-bit mono PCM into memory, uses a conservative VAD and
optionally a locally cached Swedish Whisper model. No browser, Atlas tokens,
API calls, disk recordings, or implicit model downloads.
Stdout is JSON metadata/transcripts only, never raw audio samples.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, Future
import json
from pathlib import Path
import sys
import time

from nova_local_voice import BLOCK_FRAMES, SAMPLE_RATE, SpeechGate


def emit(kind: str, **fields) -> None:
    print(json.dumps({"kind": kind, **fields}), flush=True)


def offline_transcribe(segment: bytes, model) -> str:
    """Run the model on a short utterance in memory. No network or file writes."""
    import numpy as np
    pcm = np.frombuffer(segment, dtype="<i2").astype(np.float32) / 32768.0
    if not pcm.size or np.ptp(pcm) < 0.002:
        return ""
    items, _ = model.transcribe(
        pcm,
        language="sv",
        beam_size=3,
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
        words.append(item.text.strip())
    return " ".join(words).strip()[:500]


def run(*, mode: str, seconds: float, device: int | None, model_dir: Path | None) -> int:
    if mode not in ("meter", "transcribe") or not 0.5 <= seconds <= 25:
        raise ValueError("invalid pilot options")
    import sounddevice as sd

    model = None
    if mode == "transcribe":
        if not model_dir or not model_dir.is_dir():
            emit("error", code="LOCAL_MODEL_NOT_INSTALLED")
            return 2
        for file in ("model.bin", "config.json", "tokenizer.json"):
            if not (model_dir / file).is_file():
                emit("error", code="LOCAL_MODEL_INCOMPLETE")
                return 2
        emit("loading", mode="transcribe")
        from faster_whisper import WhisperModel
        # This is an exact LOCAL directory, not a model identifier. No model
        # download or network request is possible through the worker.
        model = WhisperModel(str(model_dir), device="cpu", compute_type="int8",
                             cpu_threads=4, num_workers=1)

    selected = sd.default.device[0] if device is None else device
    info = sd.query_devices(int(selected))
    if info["max_input_channels"] < 1:
        emit("error", code="NO_MICROPHONE_CHANNELS")
        return 2
    sd.check_input_settings(
        device=int(selected), channels=1, dtype="int16", samplerate=SAMPLE_RATE
    )

    gate = SpeechGate()
    pending: Future[str] | None = None
    since = time.monotonic()
    levels = 0
    utterances = 0

    def deliver_completed() -> None:
        nonlocal pending
        if pending is None or not pending.done():
            return
        try:
            phrase = pending.result()
            if phrase:
                emit("transcript", text=phrase)
            else:
                emit("no_transcript")
        except Exception:
            emit("error", code="LOCAL_TRANSCRIPTION_FAILED")
        pending = None

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
                while time.monotonic() - since < seconds:
                    raw, overflow = stream.read(BLOCK_FRAMES)
                    if overflow:
                        emit("warning", code="CAPTURE_OVERFLOW")
                    kinds, segment, rms = gate.feed(bytes(raw))
                    levels += 1
                    if levels % 4 == 0:
                        emit("level", percent=round(rms * 100, 2),
                             speaking=gate.speaking)
                    for kind in kinds:
                        emit(kind)
                    if segment is not None and model is not None:
                        if pending is not None:
                            emit("warning", code="TRANSCRIBER_BUSY")
                        else:
                            utterances += 1
                            emit("transcribing")
                            pending = pool.submit(offline_transcribe, segment, model)
                        # Only the worker owns this frame; explicitly drop it.
                        del segment
                    elif segment is not None:
                        utterances += 1
                    deliver_completed()
                gate.clear()
            # The worker must not announce "finished" before a pending local
            # transcription has emitted its result. After capture closes we
            # wait for the single already-started, bounded utterance only.
            if pending is not None:
                try:
                    phrase = pending.result(timeout=8)
                    if phrase:
                        emit("transcript", text=phrase)
                    else:
                        emit("no_transcript")
                except Exception:
                    emit("error", code="LOCAL_TRANSCRIPTION_FAILED")
                pending = None
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
    args = parser.parse_args()
    return run(mode=args.mode, seconds=args.seconds,
               device=args.device, model_dir=args.model_path)


if __name__ == "__main__":
    sys.exit(main())
