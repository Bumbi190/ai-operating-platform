"""Local Swedish synthesis with Alma by Daniel Nylander (CC BY 4.0)."""
import hashlib
import io
import os
from pathlib import Path
import sys
import time
import tempfile
import urllib.request
import wave

REVISION = "b03e1489762690deabd2ad45dc75ff7f26c645c2"
SOURCE = "https://huggingface.co/yeagersthlm/piper-voice-sv-alma/resolve/" + REVISION + "/"
MODEL = "sv_SE-alma-medium.onnx"
DIGEST = "b4bfecd22e30cf28f514eeea06c0da440be1721435a652d0571ee65963ce8f65"


def model_path():
    return Path(os.environ.get("LOCALAPPDATA", Path.home())) / "Omnira" / "Nova" / "models" / "alma" / MODEL


def ready():
    model = model_path()
    return model.is_file() and model.with_suffix(".onnx.json").is_file()


def install():
    directory = model_path().parent
    directory.mkdir(parents=True, exist_ok=True)
    for name in (MODEL + ".json", "README.md", MODEL):
        target = directory / name
        with tempfile.NamedTemporaryFile(dir=directory, delete=False) as tmp:
            pending = Path(tmp.name)
        try:
            digest = hashlib.sha256()
            with urllib.request.urlopen(SOURCE + name, timeout=45) as response, pending.open("wb") as output:
                while chunk := response.read(262144):
                    digest.update(chunk)
                    output.write(chunk)
            if name == MODEL and digest.hexdigest() != DIGEST:
                raise ValueError("Unexpected Alma model digest")
            os.replace(pending, target)
        finally:
            pending.unlink(missing_ok=True)


def speak():
    import winsound
    from piper import PiperVoice
    voice = PiperVoice.load(str(model_path()))
    text = sys.stdin.buffer.read(12001).decode("utf-8").strip()
    if not text or len(text) > 3000:
        return 2
    for chunk in voice.synthesize(text):
        out = io.BytesIO()
        with wave.open(out, "wb") as wav:
            wav.setparams((chunk.sample_channels, chunk.sample_width, chunk.sample_rate, 0, "NONE", ""))
            wav.writeframes(chunk.audio_int16_bytes)
        winsound.PlaySound(out.getvalue(), winsound.SND_MEMORY | winsound.SND_NODEFAULT)
    print(time.monotonic(), flush=True)
    return 0


if __name__ == "__main__":
    if sys.argv[1:] == ["--install"]:
        install()
    else:
        raise SystemExit(speak())
