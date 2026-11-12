"""Local Windows replies. Starting, finishing and stopping are independent of Tk."""
from collections import deque
import os
from pathlib import Path
import subprocess
import sys
import time


class SpokenReply:
    def __init__(self):
        self.process = None
        self.prepared = None
        self.started = 0.0
        self.intervals = deque(maxlen=24)

    @staticmethod
    def _launch():
        binary = Path(os.environ["SystemRoot"]) / "System32/WindowsPowerShell/v1.0/powershell.exe"
        script = Path(__file__).with_name("nova_windows_speech.ps1")
        return subprocess.Popen(
            [str(binary), "-NoProfile", "-NonInteractive", "-File", str(script)],
            stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )

    def prepare(self):
        if self.process is None and self.prepared is None:
            try:
                self.prepared = self._launch()
            except OSError:
                pass  # Starting again at reply time reports any persistent failure.

    def discard_prepared(self):
        idle, self.prepared = self.prepared, None
        if idle is not None:
            idle.stdin.close()  # EOF without a message exits without speaking.

    def speak(self, text, *, sanna=False):
        if sanna:
            self.discard_prepared()
        idle, self.prepared = self.prepared, None
        self.stop()
        if sanna:
            self.process = subprocess.Popen(
                [sys.executable, str(Path(__file__).with_name("nova_sanna.py"))],
                stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
        elif idle is not None and idle.poll() is None:
            self.process = idle
        else:
            if idle is not None:
                idle.stdin.close()
            self.process = self._launch()
        self.started = time.monotonic()
        try:
            self.process.stdin.write(text[:700].encode("utf-8"))
            self.process.stdin.close()
        except OSError:
            self.stop()
            raise

    def overlaps(self, start, end):
        if not isinstance(start, (float, int)) or not isinstance(end, (float, int)):
            return False
        if self.process is not None and end >= self.started:
            return True
        return any(start <= b and end >= a for a, b in self.intervals)

    def _finished(self):
        self.intervals.append((self.started, time.monotonic() + 0.12))
        self.process = None

    def poll(self):
        if self.process is None:
            return None
        result = self.process.poll()
        if result is None and time.monotonic() - self.started > 85:
            self.stop()
            return 4
        if result is not None:
            self._finished()
        return result

    def stop(self):
        self.discard_prepared()
        if self.process is not None:
            if self.process.poll() is None:
                self.process.kill()
            self._finished()


def save_reply_mode(path, mode):
    if mode not in {"sanna", "windows", "text"}:
        raise ValueError("Unknown reply mode")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f".{os.getpid()}.tmp")
    temporary.write_text(mode, encoding="ascii")
    os.replace(temporary, path)


def load_reply_mode(path):
    try:
        value = path.read_text(encoding="ascii").strip()
    except (OSError, UnicodeError):
        return "choose"
    return value if value in {"sanna", "windows", "text"} else "choose"


def play_sanna_pcm():
    import io
    import sys
    import wave
    import winsound

    pcm = sys.stdin.buffer.read(2_880_001)
    if not 0 < len(pcm) <= 2_880_000 or len(pcm) % 2:
        return 2
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
        wav.writeframes(pcm)
    winsound.PlaySound(output.getvalue(), winsound.SND_MEMORY | winsound.SND_NODEFAULT)
    return 0


if __name__ == "__main__":
    import sys
    if sys.argv[1:] == ["--play-sanna-pcm"]:
        raise SystemExit(play_sanna_pcm())
