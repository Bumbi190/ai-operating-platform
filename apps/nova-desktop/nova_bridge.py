"""Nova localhost relay: zero credentials, one active browser, read-only.

A paired Omnira browser tab (not this Python process) owns authentication and
calls the existing /api/chat endpoint. This relay accepts exactly one bounded
read-only request and streams its result to the Nova UI.

Security: listen 127.0.0.1 only, strict Host/Origin, ephemeral token in headers,
small inputs, read-only events, no arbitrary URLs, no filesystem/shell primitives.
"""
from __future__ import annotations

from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import queue
import re
import secrets
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


@dataclass
class Task:
    id: str
    text: str
    issued: float
    state: str = "pending"   # pending, executing, done, canceled, failed
    result_chars: int = 0


class BridgeState:
    def __init__(self, origins=(PROD_ORIGIN,)):
        self.key = secrets.token_urlsafe(32)
        self.origins = frozenset(origins)
        self.events: queue.Queue[dict] = queue.Queue()
        self.lock = threading.RLock()
        self.task: Task | None = None
        self.connected_at = 0.0
        self.last_seen = 0.0
        self.requests_at: list[float] = []

    def switch_origin(self, origin: str) -> str:
        """Explicit preview selection invalidates the previous browser pairing."""
        approved = validate_pairing_origin(origin)
        with self.lock:
            self.origins = frozenset((approved,))
            self.key = secrets.token_urlsafe(32)
            self.connected_at = 0.0
            self.last_seen = 0.0
            self.task = None
            # Drop stale events that belonged to the earlier pairing.
            while not self.events.empty():
                try:
                    self.events.get_nowait()
                except queue.Empty:
                    break
        return approved

    def online(self) -> bool:
        with self.lock:
            return self.connected_at > 0 and (time.monotonic() - self.last_seen) < STALE_AFTER

    def heartbeat(self):
        with self.lock:
            self.last_seen = time.monotonic()

    def connect(self):
        with self.lock:
            self.connected_at = time.monotonic()
            self.last_seen = self.connected_at
            self.events.put({"kind": "connected"})

    def enqueue(self, text: str) -> tuple[str | None, str]:
        if not isinstance(text, str) or not 0 < len(text.strip()) <= MAX_PROMPT_CHARS:
            return None, "Begäran är tom eller för lång (max 3 000 tecken)."
        with self.lock:
            if not self.online():
                return None, "Atlas webbläsarflik är inte ansluten."
            if self.task and self.task.state in ("pending", "executing"):
                return None, "Nova arbetar redan med en fråga. Använd Stopp först."
            now = time.monotonic()
            self.requests_at = [ts for ts in self.requests_at if now - ts < 300]
            if len(self.requests_at) >= MAX_REQUESTS_PER_5_MIN:
                return None, "Nova har nått sin lokala gräns: högst 10 Atlas-frågor per 5 minuter."
            self.requests_at.append(now)
            self.task = Task(str(uuid.uuid4()), text.strip(), now)
            self.events.put({"kind": "queued", "id": self.task.id})
            return self.task.id, "Frågan köad till Atlas."

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
                return {"id": t.id, "text": t.text, "mode": "nova_readonly"}
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
                self.send_json(200, {"task": state.next()})
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
            if endpoint not in ("/connect", "/event"):
                self.send_json(404, {"error": "Unknown route"})
                return
            data = self.read_data(MAX_EVENT_BYTES if endpoint == "/event" else MAX_REQUEST_BYTES)
            if data is None:
                self.send_json(400, {"error": "Invalid JSON or request size"})
                return
            if endpoint == "/connect":
                if data.get("protocol") != 1:
                    self.send_json(400, {"error": "Unsupported protocol"})
                    return
                state.connect()
                self.send_json(200, {"connected": True, "mode": "read_only"})
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

    def pairing_url(self, base_origin=None):
        if base_origin is None:
            base_origin = next(iter(self.state.origins))
        if validate_pairing_origin(base_origin) not in self.state.origins:
            raise ValueError("Invalid Atlas origin")
        # URL fragment is NOT sent to Omnira's server. Browser relay immediately
        # removes it from history after reading and never persists the key.
        return f"{base_origin}/nova-bridge#port={self.port}&key={self.state.key}"

    def stop(self):
        self.state.cancel()
        self.http.shutdown()
        self.http.server_close()
        self.thread.join(timeout=3)
