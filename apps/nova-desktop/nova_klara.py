"""Offline Swedish Kokoro synthesis. Installation warms the models once on this PC."""
import json
import os
from pathlib import Path
from queue import Queue
import subprocess
import sys
from threading import Thread

VOICE_ROOT = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "Omnira/Nova/voices/kokoro-sv"
INTERPRETER = VOICE_ROOT / "Scripts/python.exe"
READY = VOICE_ROOT / "klara-v1.ready"
MAX_PCM = 2_880_000


def ready():
    return INTERPRETER.is_file() and READY.is_file()


def synthesize(engine, text):
    import numpy as np
    audio = engine.synthesize(text, voice="Klara")
    if not len(audio) or not np.isfinite(audio).all() or not np.any(audio):
        raise ValueError("Klara returned no audio")
    return (np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes()


def serve(install=False):
    # Reserve stdout for PCM framing. Some dependencies write diagnostics during import.
    wire = os.fdopen(os.dup(sys.stdout.fileno()), "wb")
    os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
    if not install:
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
    import torch
    from kokoro_sv import SwedishKokoro
    torch.set_num_threads(3)
    engine = SwedishKokoro(device="cpu")
    synthesize(engine, "Klockan är 10:15." if install else "Hej.")
    if install:
        READY.write_text("kokoro-sv 0.1.3\n", encoding="ascii")
        return
    for line in sys.stdin.buffer:
        try:
            text = json.loads(line)
            pcm = synthesize(engine, text) if isinstance(text, str) and 0 < len(text) <= 240 else b""
            if len(pcm) > MAX_PCM:
                pcm = b""
        except (ValueError, IndexError, RuntimeError):
            pcm = b""
        wire.write(len(pcm).to_bytes(4, "little"))
        wire.write(pcm)
        wire.flush()


class KlaraSession:
    """One model per call. Each reply has its own independently stoppable audio player."""
    def __init__(self):
        self.worker = subprocess.Popen([str(INTERPRETER), "-X", "utf8", str(Path(__file__).resolve())],
                                       stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                       stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
        self.pending = Queue()
        Thread(target=self._deliver, name="NovaKlara", daemon=True).start()

    def submit(self, text, player):
        self.pending.put((text, player))

    def _deliver(self):
        try:
            while (request := self.pending.get()) is not None:
                text, player = request
                try:
                    if player.poll() is not None:
                        continue
                    self.worker.stdin.write(json.dumps(text).encode("ascii") + b"\n")
                    self.worker.stdin.flush()
                    header = self.worker.stdout.read(4)
                    size = int.from_bytes(header, "little")
                    if len(header) != 4 or size > MAX_PCM:
                        raise OSError("Incomplete voice frame")
                    pcm = self.worker.stdout.read(size)
                    if size and len(pcm) == size and player.poll() is None:
                        player.stdin.write(pcm)
                except (OSError, ValueError):
                    pass
                finally:
                    try:
                        player.stdin.close()
                    except OSError:
                        pass
        finally:
            self.worker.stdin.close()
            self.worker.stdout.close()
            self.worker.wait()

    def close(self):
        if self.worker.poll() is None:
            self.worker.kill()
        self.pending.put(None)


if __name__ == "__main__":
    serve(install=sys.argv[1:] == ["--install"])
