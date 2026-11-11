"""Local Windows replies. Starting, finishing and stopping are independent of Tk."""
from collections import deque
import os
from pathlib import Path
import subprocess
import time


class SpokenReply:
    def __init__(self):
        self.process = None
        self.started = 0.0
        self.intervals = deque(maxlen=24)

    def speak(self, text):
        self.stop()
        binary = Path(os.environ["SystemRoot"]) / "System32/WindowsPowerShell/v1.0/powershell.exe"
        script = Path(__file__).with_name("nova_windows_speech.ps1")
        self.process = subprocess.Popen(
            [str(binary), "-NoProfile", "-NonInteractive", "-File", str(script)],
            stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
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
        if self.process is not None:
            if self.process.poll() is None:
                self.process.kill()
            self._finished()


def save_reply_mode(path, mode):
    if mode not in {"windows", "text"}:
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
    return value if value in {"windows", "text"} else "choose"
