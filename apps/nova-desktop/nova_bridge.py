"""Nova localhost relay: short-lived pairing and bounded operator review.

The default request is still read-only. A distinctly marked operator request
requires an explicit Nova review-menu click, a paired browser and an
authenticated Atlas session; it is handed to Atlas's normal permission/tool
path. This local relay never performs OS commands, file writes or arbitrary
URL navigation, and never stores login credentials.

Security: loopback only, strict Host/Origin, ephemeral header token, bounded
inputs, no arbitrary shell/filesystem primitives or unapproved model actions.
"""
from __future__ import annotations

from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import queue
import re
import secrets
import subprocess
import sys
from pathlib import Path
import threading
import time
from urllib.parse import urlsplit
import uuid

PROD_ORIGIN = "https://omniraos.se"
MAX_REQUEST_BYTES = 16_384
MAX_EVENT_BYTES = 8_192
MAX_PROMPT_CHARS = 3_000
STALE_AFTER = 12
TASK_TIMEOUT = 150
MAX_REQUESTS_PER_5_MIN = 10
VOICE_CONTROL_KINDS = frozenset(("voice_toggle", "voice_interrupt", "voice_resume"))
VOICE_STATUS_VALUES = frozenset(("idle", "starting", "listening", "transcribing", "thinking", "speaking", "error"))
# Only this team's Omnira Vercel preview addresses, not arbitrary web origins.
PREVIEW_HOST = re.compile(
    r"^ai-operating-platform-[a-z0-9-]+-bumbi190s-projects\.vercel\.app$"
)


def validate_pairing_origin(origin: str) -> str:
    """Allow the production site or explicitly selected protected Omnira previews."""
    if not isinstance(origin, str):
        raise ValueError("Invalid pairing origin")
    parsed = urlsplit(origin.strip())
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username
            or parsed.password or parsed.port is not None or parsed.path not in ("", "/")
            or parsed.query or parsed.fragment):
        raise ValueError("Pairing needs a bare HTTPS origin with no path or token")
    hostname = parsed.hostname
    if origin.strip().rstrip("/") == PROD_ORIGIN:
        return PROD_ORIGIN
    if PREVIEW_HOST.fullmatch(hostname):
        return "https://" + hostname
    raise ValueError("Not an authorized Omnira preview domain")


def read_saved_preview_origin(path: str) -> str | None:
    """Read only a previously verified HTTPS origin, never credentials or tokens."""
    try:
        with open(path, "r", encoding="utf-8") as source:
            value = source.read(512)
        if len(value) > 255:
            return None
        result = validate_pairing_origin(value.strip())
        return result if result != PROD_ORIGIN else None
    except (OSError, UnicodeError, ValueError):
        return None


@dataclass
class Task:
    id: str
    text: str
    issued: float
    mode: str = "nova_readonly"
    state: str = "pending"   # pending, executing, done, canceled, failed
    result_chars: int = 0
    audio_claimed: bool = False


class BridgeState:
    def __init__(self, origins=(PROD_ORIGIN,)):
        self.key = secrets.token_urlsafe(32)
        self.origins = frozenset(origins)
        self.events: queue.Queue[dict] = queue.Queue()
        self.lock = threading.RLock()
        self.task: Task | None = None
        self.audio_process = None
        self.connected_at = 0.0
        self.last_seen = 0.0
        self.requests_at: list[float] = []
        self.voice_authorized = False
        self.voice_input_mode = "browser"
        self.desktop_replies = False
        self.voice_status = "idle"
        self.voice_status_at = 0.0
        self.control_pending: dict | None = None

    def stop_audio(self):
        with self.lock:
            player = self.audio_process
            if player is not None and player.poll() is None:
                player.kill()

    def play_reply_audio(self, task_id, pcm):
        with self.lock:
            task = self.task
            if (not self.online() or not self.voice_authorized or not self.desktop_replies
                    or not task or task.mode != "nova_speech" or task.state != "executing"
                    or task.id != task_id or task.audio_claimed):
                return False
            task.audio_claimed = True
            player = subprocess.Popen(
                [sys.executable, str(Path(__file__).with_name("nova_spoken_reply.py")), "--play-sanna-pcm"],
                stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            self.audio_process = player
        try:
            player.communicate(input=pcm, timeout=len(pcm) / 48000 + 8)
            return player.returncode == 0
        except subprocess.TimeoutExpired:
            player.kill()
            player.wait()
            return False
        finally:
            with self.lock:
                if self.audio_process is player:
                    self.audio_process = None

    def switch_origin(self, origin: str) -> str:
        """Explicit preview selection invalidates the previous browser pairing."""
        approved = validate_pairing_origin(origin)
        with self.lock:
            self.stop_audio()
            self.origins = frozenset((approved,))
            self.key = secrets.token_urlsafe(32)
            self.connected_at = 0.0
            self.last_seen = 0.0
            self.task = None
            self.voice_authorized = False
            self.voice_input_mode = "browser"
            self.desktop_replies = False
            self.voice_status = "idle"
            self.voice_status_at = 0.0
            self.control_pending = None
            # Drop stale events that belonged to the earlier pairing.
            while not self.events.empty():
                try:
                    self.events.get_nowait()
                except queue.Empty:
                    break
        return approved

    def online(self) -> bool:
        with self.lock:
            alive = self.connected_at > 0 and (time.monotonic() - self.last_seen) < STALE_AFTER
            if not alive and self.voice_authorized:
                self.stop_audio()
                self.voice_authorized = False
                self.voice_status = "idle"
                self.voice_status_at = 0.0
                self.control_pending = None
            return alive

    def heartbeat(self):
        with self.lock:
            self.last_seen = time.monotonic()

    def connect(self):
        with self.lock:
            self.connected_at = time.monotonic()
            self.last_seen = self.connected_at
            self.stop_audio()
            # A new browser page must explicitly authorize its microphone again.
            self.voice_authorized = False
            self.voice_input_mode = "browser"
            self.desktop_replies = False
            self.voice_status = "idle"
            self.voice_status_at = 0.0
            self.control_pending = None
            self.events.put({"kind": "connected"})

    def authorize_voice(self, *, mode: str = "browser", desktop_replies: bool = False) -> tuple[bool, str]:
        if mode not in ("browser", "native"):
            return False, "Unsupported input mode"
        with self.lock:
            if not self.online():
                return False, "Atlas-webbl\\u00e4saren \\u00e4r inte ansluten."
            self.voice_authorized = True
            self.voice_input_mode = mode
            self.desktop_replies = mode == "native" and desktop_replies is True
            self.voice_status = "idle" if mode == "native" else "starting"
            self.voice_status_at = time.monotonic()
            self.control_pending = None
            return True, "R\\u00f6stsamtalet \\u00e4r godk\\u00e4nt av anv\\u00e4ndaren."

    def revoke_voice(self) -> None:
        with self.lock:
            self.stop_audio()
            self.voice_authorized = False
            self.voice_input_mode = "browser"
            self.desktop_replies = False
            self.voice_status = "idle"
            self.voice_status_at = 0.0
            self.control_pending = None

    def request_voice_control(self, kind: str) -> tuple[bool, str]:
        if kind not in VOICE_CONTROL_KINDS:
            return False, "Ok\\u00e4nt r\\u00f6stkommando."
        with self.lock:
            if not self.online():
                return False, "Atlas-webbl\\u00e4saren \\u00e4r inte ansluten."
            if not self.voice_authorized:
                return False, "R\\u00f6stsamtalet beh\\u00f6ver f\\u00f6rst godk\\u00e4nnas i Omnira-webbl\\u00e4saren."
            # Emergency interruption supersedes a queued toggle. A toggle never
            # replaces another unacknowledged command, preventing double toggles.
            if kind == "voice_interrupt":
                self.control_pending = {"id": str(uuid.uuid4()), "kind": kind}
                return True, "Avbrottet skickades till Atlas."
            if self.control_pending:
                return False, "Ett r\\u00f6stkommando v\\u00e4ntar redan p\\u00e5 bekr\\u00e4ftelse."
            self.control_pending = {"id": str(uuid.uuid4()), "kind": kind}
            return True, "R\\u00f6stkommandot skickades till Atlas."

    def next_voice_control(self) -> dict:
        with self.lock:
            if not self.online() or not self.voice_authorized or not self.control_pending:
                return {}
            return dict(self.control_pending)

    def acknowledge_voice_control(self, control_id: str) -> bool:
        with self.lock:
            if not self.control_pending or self.control_pending.get("id") != control_id:
                return False
            self.control_pending = None
            self.heartbeat()
            return True

    def update_voice_status(self, status: str) -> bool:
        if status not in VOICE_STATUS_VALUES:
            return False
        with self.lock:
            if not self.online() or not self.voice_authorized:
                return False
            self.voice_status = status
            self.voice_status_at = time.monotonic()
            self.heartbeat()
            return True

    def voice_snapshot(self) -> dict:
        with self.lock:
            if not self.online():
                return {"authorized": False, "status": "idle"}
            return {"authorized": self.voice_authorized, "status": self.voice_status,
                    "mode": self.voice_input_mode}

    def enqueue(self, text: str, *, mode: str = "nova_readonly") -> tuple[str | None, str]:
        if mode not in ("nova_readonly", "atlas_operator", "nova_voice", "nova_speech"):
            return None, "Okant uppdragslage."
        if not isinstance(text, str) or not 0 < len(text.strip()) <= MAX_PROMPT_CHARS:
            return None, "Begäran är tom eller för lång (max 3 000 tecken)."
        with self.lock:
            if not self.online():
                return None, "Atlas webbläsarflik är inte ansluten."
            if mode in ("atlas_operator", "nova_voice", "nova_speech") and not self.voice_authorized:
                return None, "Verktygsuppdrag kraver forst godkant Atlas-samtal i Omnira."
            if mode == "nova_speech" and (not self.desktop_replies or len(text) > 300):
                return None, "Anslut den uppdaterade Omnira-fliken för att höra Sanna."
            if mode in ("nova_voice", "nova_speech") and self.voice_input_mode != "native":
                return None, "Windows-r?stl?ge ?r inte godk?nt."
            if self.task and self.task.state in ("pending", "executing"):
                return None, "Nova arbetar redan med en fråga. Använd Stopp först."
            now = time.monotonic()
            self.requests_at = [ts for ts in self.requests_at if now - ts < 300]
            if len(self.requests_at) >= MAX_REQUESTS_PER_5_MIN:
                return None, "Nova har nått sin lokala gräns: högst 10 Atlas-frågor per 5 minuter."
            self.requests_at.append(now)
            self.task = Task(str(uuid.uuid4()), text.strip(), now, mode=mode)
            self.events.put({"kind": "queued", "id": self.task.id, "mode": mode})
            return self.task.id, "Uppdraget koat till Atlas." if mode == "atlas_operator" else "Fragan koad till Atlas i laslage."

    def enqueue_native_voice(self, text: str) -> tuple[str | None, str]:
        """One user-requested local STT turn; the browser owns Atlas auth.

        No HTTP endpoint can create this task. Execution still goes through
        Atlas's server-side user, project and tool authorization.
        """
        if not isinstance(text, str) or not 0 < len(text.strip()) <= 500:
            return None, "Ogiltigt lokalt r?stkommando."
        with self.lock:
            if not self.online() or not self.voice_authorized or self.voice_input_mode != "native":
                return None, "Aktivera ett godk?nt Windows-r?stsamtal f?rst."
        return self.enqueue(text, mode="nova_voice")

    def enqueue_operator(self, text: str) -> tuple[str | None, str]:
        """Explicit native operator approval, never a speech- or LLM-generated call."""
        return self.enqueue(text, mode="atlas_operator")

    def next(self) -> dict:
        with self.lock:
            self.heartbeat()
            t = self.task
            if t and t.state == "pending":
                if time.monotonic() - t.issued > TASK_TIMEOUT:
                    t.state = "failed"
                    self.events.put({"kind": "error", "text": "Atlas-uppdraget fick timeout."})
                    return {}
                t.state = "executing"
                return {"id": t.id, "text": t.text, "mode": t.mode}
            return {}

    def add_event(self, data: dict) -> tuple[bool, str]:
        if not isinstance(data, dict):
            return False, "Invalid event."
        with self.lock:
            t = self.task
            if not t or data.get("id") != t.id or t.state != "executing":
                return False, "Unknown, canceled or completed task."
            kind = data.get("kind")
            if kind == "text":
                delta = data.get("text", "")
                if not isinstance(delta, str) or len(delta) > 4096:
                    return False, "Invalid text delta."
                t.result_chars += len(delta)
                if t.result_chars > 30_000:
                    t.state = "failed"
                    self.events.put({"kind": "error", "text": "Svaret överskred gränsen."})
                    return False, "Reply limit."
                if delta:
                    self.events.put({"kind": "text", "id": t.id, "text": delta})
            elif kind in ("done", "error"):
                t.state = "done" if kind == "done" else "failed"
                detail = data.get("text", "")
                if not isinstance(detail, str):
                    detail = ""
                self.events.put({"kind": kind, "id": t.id, "text": detail[:250]})
            else:
                return False, "Unknown event."
            self.heartbeat()
            return True, "ok"

    def cancel(self):
        with self.lock:
            self.stop_audio()
            t = self.task
            if t and t.state in ("pending", "executing"):
                t.state = "canceled"
                self.events.put({"kind": "canceled", "id": t.id})

    def task_state(self, task_id: str) -> str:
        with self.lock:
            self.heartbeat()
            if not self.task or self.task.id != task_id:
                return "unknown"
            if self.task.state == "executing" and time.monotonic() - self.task.issued > TASK_TIMEOUT:
                self.task.state = "failed"
                self.events.put({"kind": "error", "text": "Atlas-uppdraget fick timeout."})
            return self.task.state


def create_handler(state: BridgeState):
    class RelayHandler(BaseHTTPRequestHandler):
        server_version = "NovaBridge/0.1"
        sys_version = ""

        def log_message(self, _fmt, *_args):
            # Do not log URL, token, prompts, response content or IP.
            pass

        def origin_ok(self) -> bool:
            return self.headers.get("Origin") in state.origins

        def host_ok(self) -> bool:
            return self.headers.get("Host") == f"127.0.0.1:{self.server.server_port}"

        def cors(self):
            if self.origin_ok():
                self.send_header("Access-Control-Allow-Origin", self.headers["Origin"])
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Nova-Token")
                self.send_header("Vary", "Origin")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")

        def send_json(self, code: int, data: dict):
            body = json.dumps(data, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.cors()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def authorized(self) -> bool:
            return (self.host_ok() and self.origin_ok()
                    and secrets.compare_digest(self.headers.get("X-Nova-Token", ""), state.key))

        def endpoint(self):
            return urlsplit(self.path).path

        def do_OPTIONS(self):
            if not self.host_ok() or not self.origin_ok():
                self.send_json(403, {"error": "Forbidden origin"})
                return
            self.send_response(204)
            self.cors()
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_GET(self):
            if not self.authorized():
                self.send_json(403, {"error": "Not authorized"})
                return
            if self.endpoint() == "/next":
                self.send_json(200, {"task": state.next(), "command": state.next_voice_control()})
            elif self.endpoint() == "/status":
                task_id = urlsplit(self.path).query
                self.send_json(200, {"state": state.task_state(task_id)})
            else:
                self.send_json(404, {"error": "Unknown route"})

        def read_data(self, limit: int) -> dict | None:
            try:
                raw_length = self.headers.get("Content-Length", "")
                size = int(raw_length)
                if size < 0:
                    return None
                if size > limit:
                    # Drain only a small oversize request; otherwise Windows may
                    # reset the socket with an unread body before our 400 arrives.
                    if size <= limit + 8192:
                        self.rfile.read(size)
                    else:
                        self.close_connection = True
                    return None
                payload = json.loads(self.rfile.read(size))
                return payload if isinstance(payload, dict) else None
            except (ValueError, TypeError, UnicodeDecodeError, json.JSONDecodeError):
                return None

        def do_POST(self):
            if not self.authorized():
                self.send_json(403, {"error": "Not authorized"})
                return
            endpoint = self.endpoint()
            if endpoint == "/speech/audio":
                try:
                    size = int(self.headers.get("Content-Length", ""))
                    if (self.headers.get("Content-Type") != "audio/pcm"
                            or not 0 < size <= 2_880_000 or size % 2):
                        raise ValueError()
                    self.connection.settimeout(10)
                    pcm = self.rfile.read(size)
                    if len(pcm) != size:
                        raise ValueError()
                    played = state.play_reply_audio(urlsplit(self.path).query, pcm)
                except (ValueError, OSError):
                    self.close_connection = True
                    self.send_json(400, {"played": False})
                else:
                    self.send_json(200 if played else 409, {"played": played})
                return
            if endpoint not in ("/connect", "/event", "/voice/authorize", "/voice/revoke", "/voice/status", "/control/ack"):
                self.send_json(404, {"error": "Unknown route"})
                return
            data = self.read_data(MAX_EVENT_BYTES if endpoint in ("/event", "/voice/status", "/control/ack") else MAX_REQUEST_BYTES)
            if data is None:
                self.send_json(400, {"error": "Invalid JSON or request size"})
                return
            if endpoint == "/connect":
                if set(data) != {"protocol"} or data.get("protocol") != 1:
                    self.send_json(400, {"error": "Unsupported protocol"})
                    return
                state.connect()
                self.send_json(200, {"connected": True, "mode": "read_only", "voice_control": "user_gesture_required"})
            elif endpoint == "/voice/authorize":
                if data.get("protocol") != 1:
                    self.send_json(400, {"error": "Unsupported protocol"})
                    return
                if (set(data) not in ({"protocol"}, {"protocol", "mode"}, {"protocol", "mode", "desktopReplies"})
                        or data.get("mode", "browser") not in ("browser", "native")
                        or ("desktopReplies" in data and
                            (data.get("mode") != "native" or not isinstance(data["desktopReplies"], bool)))):
                    self.send_json(400, {"error": "Invalid voice mode"})
                    return
                accepted, message = state.authorize_voice(mode=data.get("mode", "browser"),
                                                         desktop_replies=data.get("desktopReplies") is True)
                self.send_json(200 if accepted else 409, {"authorized": accepted, "message": message,
                                                          "windowsPlayback": accepted and state.desktop_replies})
            elif endpoint == "/voice/revoke":
                if set(data) != {"protocol"} or data.get("protocol") != 1:
                    self.send_json(400, {"error": "Unsupported protocol"})
                    return
                state.revoke_voice()
                self.send_json(200, {"authorized": False})
            elif endpoint == "/voice/status":
                if set(data) != {"status"} or not isinstance(data.get("status"), str):
                    self.send_json(400, {"error": "Invalid voice status"})
                    return
                accepted = state.update_voice_status(data["status"])
                self.send_json(200 if accepted else 409, {"ok": accepted})
            elif endpoint == "/control/ack":
                if set(data) != {"id"} or not isinstance(data.get("id"), str) or len(data["id"]) > 64:
                    self.send_json(400, {"error": "Invalid control acknowledgement"})
                    return
                accepted = state.acknowledge_voice_control(data["id"])
                self.send_json(200 if accepted else 409, {"ok": accepted})
            else:
                if not state.online():
                    self.send_json(409, {"error": "Not connected"})
                    return
                accepted, message = state.add_event(data)
                self.send_json(200 if accepted else 409, {"ok": accepted, "message": message})

    return RelayHandler


class NovaBridge:
    def __init__(self, origins=(PROD_ORIGIN,)):
        self.state = BridgeState(origins)
        self.http = ThreadingHTTPServer(("127.0.0.1", 0), create_handler(self.state))
        self.http.daemon_threads = True
        self.port = self.http.server_port
        self.thread = threading.Thread(target=self.http.serve_forever, name="NovaLoopback", daemon=True)

    def start(self):
        self.thread.start()

    def pairing_url(self, base_origin=None, *, auto_voice: bool = False, native_voice: bool = False):
        if base_origin is None:
            base_origin = next(iter(self.state.origins))
        if validate_pairing_origin(base_origin) not in self.state.origins:
            raise ValueError("Invalid Atlas origin")
        # URL fragment is NOT sent to Omnira's server. Browser relay immediately
        # removes it from history after reading and never persists the key.
        # A marker is included only for an explicit Windows hotkey gesture.
        # The secret token is still ephemeral and scrubbed in the browser.
        suffix = ("&hotkey=1" if auto_voice is True else "") + ("&native=1" if auto_voice is True and native_voice is True else "")
        return f"{base_origin}/nova-bridge#port={self.port}&key={self.state.key}{suffix}"

    def stop(self):
        self.state.cancel()
        self.http.shutdown()
        self.http.server_close()
        self.thread.join(timeout=3)
