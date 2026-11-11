"""Nova's foreground-only native audio pilot controller (stdlib only).

Runs a short-lived sounddevice/faster-whisper worker in the user's dedicated
venv, reads bounded metadata and local transcripts, never records to disk or
uploads microphone audio. No automatic start on import or Windows login.
The controller does not have Atlas credentials or file-write capabilities.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import queue
import subprocess
import threading
from typing import Any

from nova_local_voice import CONVERSATION_SECONDS, PILOT_SECONDS

WORKER = Path(__file__).resolve().with_name("nova_local_voice_worker.py")
ENV_ROOT = (
    Path(os.environ.get("USERPROFILE", str(Path.home())))
    / "Projects" / "Omnira" / "Administration" / "NovaDesktop"
)
VENV_PYTHON = ENV_ROOT / ".venv-audio" / "Scripts" / "python.exe"
MODEL_ROOT = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "Omnira" / "Nova" / "models"


def _installed_model(directory):
    return all((directory / name).is_file() for name in ("model.bin", "config.json", "tokenizer.json"))


def _preferred_model(root):
    small = root / "faster-whisper-small"
    return small if _installed_model(small) else root / "faster-whisper-tiny"


MODEL_DIR = _preferred_model(MODEL_ROOT)
ALLOWED_EVENTS = frozenset({
    "ready", "loading", "level", "speech_start", "speech_end", "transcribing",
    "transcript", "no_transcript", "warning", "error", "finished", "exit",
})
MAX_EVENT_CHARS = 1200
MAX_SESSION_SECONDS = PILOT_SECONDS


def local_model_ready() -> bool:
    return _installed_model(MODEL_DIR)


class NativeAudioSession:
    """One explicitly started, bounded worker. Tkinter stays on its UI thread."""

    def __init__(self) -> None:
        self.events: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=180)
        self.process: subprocess.Popen[str] | None = None
        self._reader: threading.Thread | None = None
        self._deadman: threading.Timer | None = None
        self.mode: str = "meter"

    def _emit(self, event: dict[str, Any]) -> None:
        try:
            self.events.put_nowait(event)
        except queue.Full:
            # Dropping a diagnostic level event is preferable to queuing stale
            # audio status or allowing a background thread to block.
            pass

    def start(self, *, seconds: float = 20.0, transcribe: bool = False, conversation: bool = False) -> None:
        if self.process is not None:
            raise RuntimeError("Local audio pilot already started")
        limit = CONVERSATION_SECONDS if conversation and transcribe else PILOT_SECONDS
        if not 0.5 <= seconds <= limit:
            raise ValueError("Invalid audio session duration")
        if not VENV_PYTHON.is_file() or not WORKER.is_file():
            raise RuntimeError("NOVA_AUDIO_ENV_NOT_INSTALLED")
        if transcribe and not local_model_ready():
            raise RuntimeError("NOVA_SPEECH_MODEL_NOT_INSTALLED")

        self.mode = "transcribe" if transcribe else "meter"
        argv = [
            str(VENV_PYTHON), "-u", str(WORKER), "--mode", self.mode,
            "--seconds", str(float(seconds)),
        ]
        if conversation and transcribe:
            argv.append("--conversation")
        if transcribe:
            argv += ["--model-path", str(MODEL_DIR)]
        # No shell=True, token, URL, code prompt or user-supplied path.
        self.process = subprocess.Popen(
            argv, cwd=str(WORKER.parent), stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            text=True, encoding="utf-8", errors="replace", bufsize=1,
        )
        self._reader = threading.Thread(
            target=self._watch, name="NovaNativeMicReadOnly",
            daemon=True,
        )
        self._reader.start()
        # Terminate a wedged driver/model worker even if it stops producing
        # events. Timer is daemonized and never records microphone content.
        self._deadman = threading.Timer(seconds + 12, self._expire)
        self._deadman.daemon = True
        self._deadman.start()

    def _expire(self) -> None:
        proc = self.process
        if proc is not None and proc.poll() is None:
            try:
                proc.terminate()
            except OSError:
                pass
            self._emit({"kind": "error", "code": "LOCAL_MIC_DEADMAN_TIMEOUT"})

    def _watch(self) -> None:
        proc = self.process
        if proc is None or proc.stdout is None:
            return
        try:
            for raw in proc.stdout:
                if len(raw) > MAX_EVENT_CHARS:
                    continue
                try:
                    event = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if not isinstance(event, dict) or event.get("kind") not in ALLOWED_EVENTS:
                    continue
                if event["kind"] == "transcript":
                    text = event.get("text")
                    if not isinstance(text, str) or not 0 < len(text) <= 500:
                        continue
                self._emit(event)
            self._emit({"kind": "exit", "returncode": proc.wait(timeout=2)})
        except (OSError, subprocess.TimeoutExpired):
            self._emit({"kind": "error", "code": "LOCAL_AUDIO_WORKER_FAILED"})
        finally:
            if self._deadman:
                self._deadman.cancel()
            try:
                proc.stdout.close()
            except OSError:
                pass

    def running(self) -> bool:
        return self.process is not None and self.process.poll() is None

    def stop(self) -> None:
        """Cancel audio capture immediately. Never wait on the Tk main thread."""
        if self._deadman:
            self._deadman.cancel()
        proc = self.process
        if proc is not None and proc.poll() is None:
            try:
                proc.terminate()
            except OSError:
                pass
        # Worker is never restarted in place; a new object starts each pilot.
        self.process = None

    def pop_events(self, limit: int = 15) -> list[dict[str, Any]]:
        events = []
        for _ in range(max(0, min(limit, 30))):
            try:
                events.append(self.events.get_nowait())
            except queue.Empty:
                break
        return events
