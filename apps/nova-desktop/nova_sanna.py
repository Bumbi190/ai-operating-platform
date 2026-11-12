"""Standalone Sanna playback. Only reply text is sent to ElevenLabs, when configured."""
import ctypes
from ctypes import wintypes
import io
import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.request
import wave

MODEL = "eleven_multilingual_v2"
# This is Sanna Hartfield's public Swedish Conversational catalogue voice.
VOICE = "4xkUqaR9MYOJHoaC1Nak"
REPLIES = {
    "nu spelar spotify.": "spotify-playing",
    "musiken är pausad.": "spotify-paused",
    "jag har läst texten i fönstret. du ser den i chatten.": "screen-read",
    "jag kunde inte läsa fönstret. ha sidan framme och försök igen.": "screen-unavailable",
    "du kan läsa mitt svar i chatten.": "text-answer",
    "jag kunde inte bekräfta uppspelningen i spotify.": "spotify-unconfirmed",
    "spotify är öppet.": "spotify-open",
    "vill du att jag öppnar spotify?": "spotify-confirm",
    "öppnar omniras kalender.": "calendar",
    "ja, jag hör dig. vad vill du göra?": "greeting",
}


def status_speech(text, configured):
    if configured or text.strip().casefold() in REPLIES:
        return text
    return "Du kan läsa mitt svar i chatten."


def key_path():
    return Path(os.environ["LOCALAPPDATA"]) / "Omnira" / "Nova" / "sanna-key.dpapi"


class Blob(ctypes.Structure):
    _fields_ = [("size", wintypes.DWORD), ("data", ctypes.POINTER(ctypes.c_ubyte))]


def _protect(data, *, decrypt):
    crypt = ctypes.WinDLL("crypt32", use_last_error=True)
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    fun = crypt.CryptUnprotectData if decrypt else crypt.CryptProtectData
    fun.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.POINTER(Blob), ctypes.c_void_p,
                    ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
    fun.restype = wintypes.BOOL
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    buf = (ctypes.c_ubyte * len(data)).from_buffer_copy(data)
    src, out = Blob(len(data), buf), Blob()
    if not fun(ctypes.byref(src), None, None, None, None, 1, ctypes.byref(out)):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        return ctypes.string_at(out.data, out.size)
    finally:
        ctypes.memset(out.data, 0, out.size)
        kernel.LocalFree(out.data)


def save_key(key):
    key = key.strip()
    if not (1 <= len(key) <= 512 and key.isascii() and key.isprintable() and not any(c.isspace() for c in key)):
        raise ValueError("Ogiltig nyckel.")
    path = key_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(f".{os.getpid()}.tmp")
    try:
        tmp.write_bytes(_protect(key.encode(), decrypt=False))
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def key_configured():
    return bool(os.environ.get("NOVA_ELEVENLABS_API_KEY") or os.environ.get("ELEVENLABS_API_KEY") or key_path().is_file())


def provider_key():
    for name in ("NOVA_ELEVENLABS_API_KEY", "ELEVENLABS_API_KEY"):
        if os.environ.get(name):
            return os.environ[name].strip()
    path = key_path()
    return _protect(path.read_bytes(), decrypt=True).decode() if path.is_file() else ""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def reply_wave(text):
    name = REPLIES.get(text.strip().casefold())
    if name:
        return (Path(__file__).parent / "voices" / "sanna" / (name + ".wav")).read_bytes()
    key = provider_key()
    if not key:
        return None
    payload = json.dumps({"text": text, "model_id": MODEL, "language_code": "sv"}).encode()
    request = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE}/stream?output_format=pcm_24000",
        data=payload, headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/pcm"})
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=25) as response:
        if response.headers.get_content_type() not in ("audio/pcm", "audio/x-pcm", "application/octet-stream"):
            raise ValueError("Leverantören returnerade inte PCM-ljud.")
        pcm = response.read(2_880_001)
    if not 0 < len(pcm) <= 2_880_000 or len(pcm) % 2:
        raise ValueError("Ofullständigt ljud.")
    wav = io.BytesIO()
    with wave.open(wav, "wb") as dest:
        dest.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
        dest.writeframes(pcm)
    return wav.getvalue()


def main():
    import winsound
    try:
        text = sys.stdin.buffer.read(2601).decode("utf-8")
        if not 0 < len(text.strip()) <= 600:
            return 2
        wav = reply_wave(text)
        if wav is None:
            return 3
        winsound.PlaySound(wav, winsound.SND_MEMORY | winsound.SND_NODEFAULT)
        print(time.monotonic(), flush=True)
        return 0
    except urllib.error.HTTPError as exc:
        return 5 if exc.code in (401, 403) else 6
    except (OSError, ValueError, RuntimeError):
        return 6


if __name__ == "__main__":
    raise SystemExit(main())
